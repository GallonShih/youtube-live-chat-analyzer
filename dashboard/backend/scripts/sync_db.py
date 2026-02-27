#!/usr/bin/env python3
"""
DB Sync Script
==============
在兩個 PostgreSQL 資料庫之間，以時間範圍批次同步指定資料表的資料。
PK 重複時略過（ON CONFLICT DO NOTHING）。

使用方式：
    python sync_db.py \\
        --source-url "postgresql://user:pass@host:5432/dbname" \\
        --target-url "postgresql://user:pass@host:5432/dbname" \\
        --table chat_messages \\
        --start "2025-01-01T00:00:00+00:00" \\
        --end   "2025-01-02T00:00:00+00:00"

選用參數：
    --time-column   指定時間過濾欄位（預設自動判斷）
    --batch-size    每批次筆數（預設 1000）
    --dry-run       只計算筆數，不實際寫入
    --verbose       顯示詳細進度

需要：psycopg2-binary（已在 requirements.txt 內）

支援的資料表及預設時間欄位：
    chat_messages           → published_at
    processed_chat_messages → published_at
    live_streams            → actual_start_time
    其他資料表              → created_at（自動偵測）

不支援的資料表（SERIAL PK，需額外處理）：
    stream_stats

分頁策略：
    使用 Keyset Pagination（游標分頁），以 (time_col, pk_col) 作為游標，
    避免 LIMIT/OFFSET 在時間戳重複時漏資料。
    僅支援單欄 PK 的資料表。
"""

import argparse
import sys
import datetime
from typing import Optional

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not found. Install with: pip install psycopg2-binary")
    sys.exit(1)


# ── 各資料表預設時間欄位 ──────────────────────────────────────────────────────

TABLE_TIME_COLUMNS = {
    "chat_messages": "published_at",
    "processed_chat_messages": "published_at",
    "live_streams": "actual_start_time",
    "etl_execution_log": "started_at",
    "word_analysis_log": "created_at",
}

# SERIAL PK 的資料表目前不支援同步（sequence 不同步問題需額外處理）
UNSUPPORTED_TABLES = {"stream_stats"}

DEFAULT_TIME_COLUMN = "created_at"


# ── 資料庫 introspection ──────────────────────────────────────────────────────

def get_columns(conn, table_name: str) -> list[str]:
    """取得資料表所有欄位名稱（依原始順序）"""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position
            """,
            (table_name,),
        )
        rows = cur.fetchall()
    if not rows:
        raise ValueError(f"Table '{table_name}' not found in public schema.")
    return [r[0] for r in rows]


def get_primary_keys(conn, table_name: str) -> list[str]:
    """取得資料表 PK 欄位清單"""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema    = 'public'
              AND tc.table_name      = %s
            ORDER BY kcu.ordinal_position
            """,
            (table_name,),
        )
        rows = cur.fetchall()
    if not rows:
        raise ValueError(f"No primary key found for table '{table_name}'.")
    return [r[0] for r in rows]


def get_jsonb_columns(conn, table_name: str) -> set[str]:
    """找出 JSONB 欄位（頂層值可能是 dict 或 list，都需要用 Json() 包裝）"""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = %s
              AND data_type    = 'jsonb'
            """,
            (table_name,),
        )
        rows = cur.fetchall()
    return {r[0] for r in rows}


def get_serial_columns(conn, table_name: str) -> set[str]:
    """找出使用 SERIAL / GENERATED 的欄位（供後續判斷是否需要 OVERRIDING）"""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = %s
              AND (
                  column_default LIKE 'nextval(%%'
                  OR is_identity = 'YES'
              )
            """,
            (table_name,),
        )
        rows = cur.fetchall()
    return {r[0] for r in rows}


def detect_time_column(table_name: str, columns: list[str]) -> str:
    """自動偵測時間過濾欄位"""
    if table_name in TABLE_TIME_COLUMNS:
        col = TABLE_TIME_COLUMNS[table_name]
        if col in columns:
            return col
    if DEFAULT_TIME_COLUMN in columns:
        return DEFAULT_TIME_COLUMN
    # 最後嘗試常見名稱
    for candidate in ("updated_at", "published_at", "collected_at", "started_at"):
        if candidate in columns:
            return candidate
    raise ValueError(
        f"Cannot detect time column for table '{table_name}'. "
        f"Use --time-column to specify one. Available columns: {columns}"
    )


# ── 查詢 ──────────────────────────────────────────────────────────────────────

def count_rows(
    conn,
    table_name: str,
    time_col: str,
    start: datetime.datetime,
    end: datetime.datetime,
) -> int:
    """計算來源資料列數（用於進度顯示）"""
    with conn.cursor() as cur:
        cur.execute(
            f'SELECT COUNT(*) FROM "{table_name}" WHERE "{time_col}" >= %s AND "{time_col}" < %s',
            (start, end),
        )
        return cur.fetchone()[0]


def fetch_batch_keyset(
    conn,
    table_name: str,
    columns: list[str],
    jsonb_cols: set[str],
    time_col: str,
    pk_col: str,
    start: datetime.datetime,
    end: datetime.datetime,
    cursor_time: Optional[datetime.datetime],
    cursor_pk,
    batch_size: int,
) -> list[tuple]:
    """
    Keyset Pagination 取資料。

    使用 (time_col, pk_col) 作為游標，確保時間戳相同時不漏資料。
    游標邏輯：下一批 = time_col > cursor_time
                    OR (time_col = cursor_time AND pk_col > cursor_pk)

    JSONB 欄位以 ::text 讀出，保留 JSON null（"null" 字串）
    與 SQL NULL（Python None）的區別，供寫入時正確還原。
    """
    # JSONB 欄位 cast 成 text，其餘保持原型別
    col_list = ", ".join(
        f'"{c}"::text AS "{c}"' if c in jsonb_cols else f'"{c}"'
        for c in columns
    )

    if cursor_time is None:
        # 第一批：從 start 開始
        sql = f"""
            SELECT {col_list}
            FROM "{table_name}"
            WHERE "{time_col}" >= %s AND "{time_col}" < %s
            ORDER BY "{time_col}", "{pk_col}"
            LIMIT %s
        """
        params = (start, end, batch_size)
    else:
        # 後續批次：以游標接續，不需要 OFFSET
        sql = f"""
            SELECT {col_list}
            FROM "{table_name}"
            WHERE "{time_col}" < %s
              AND (
                  "{time_col}" > %s
                  OR ("{time_col}" = %s AND "{pk_col}" > %s)
              )
            ORDER BY "{time_col}", "{pk_col}"
            LIMIT %s
        """
        params = (end, cursor_time, cursor_time, cursor_pk, batch_size)

    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


# ── 寫入 ──────────────────────────────────────────────────────────────────────

def build_insert_sql(
    table_name: str,
    columns: list[str],
    pk_columns: list[str],
    has_serial: bool,
) -> str:
    """
    建立 execute_values 相容的 INSERT 語句。
    VALUES 後使用單一 %s，由 execute_values 展開為多列。
    有 SERIAL/IDENTITY PK 時加上 OVERRIDING SYSTEM VALUE。
    """
    col_list      = ", ".join(f'"{c}"' for c in columns)
    conflict_cols = ", ".join(f'"{c}"' for c in pk_columns)
    overriding    = "OVERRIDING SYSTEM VALUE " if has_serial else ""

    return (
        f'INSERT INTO "{table_name}" ({col_list}) '
        f"{overriding}"
        f"VALUES %s "
        f"ON CONFLICT ({conflict_cols}) DO NOTHING"
    )


def build_row_template(columns: list[str], jsonb_cols: set[str]) -> str:
    """
    建立 execute_values 的 per-row template。
    JSONB 欄位使用 %s::jsonb，讓 PostgreSQL 把 text 轉回 JSONB：
      - SQL NULL  → None → %s::jsonb → NULL           ✓
      - JSON null → "null" → %s::jsonb → JSONB null   ✓
      - JSON obj  → "{...}" → %s::jsonb → JSONB obj   ✓
    """
    placeholders = ["%s::jsonb" if c in jsonb_cols else "%s" for c in columns]
    return "(" + ", ".join(placeholders) + ")"


def insert_batch(conn, sql: str, rows: list[tuple], row_template: str) -> int:
    """批次寫入，回傳實際寫入筆數（ON CONFLICT DO NOTHING 略過的不計）"""
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur, sql, rows, template=row_template, page_size=len(rows)
        )
        inserted = cur.rowcount
    conn.commit()
    return max(inserted, 0)


# ── 主流程 ────────────────────────────────────────────────────────────────────

def sync(
    source_url: str,
    target_url: str,
    table_name: str,
    start: datetime.datetime,
    end: datetime.datetime,
    time_column: Optional[str],
    batch_size: int,
    dry_run: bool,
    verbose: bool,
) -> None:
    if table_name in UNSUPPORTED_TABLES:
        raise ValueError(
            f"Table '{table_name}' is not supported for sync. "
            f"Unsupported tables: {sorted(UNSUPPORTED_TABLES)}"
        )

    print(f"\n{'='*60}")
    print(f"  Table      : {table_name}")
    print(f"  Time range : {start.isoformat()} → {end.isoformat()}")
    print(f"  Batch size : {batch_size}")
    print(f"  Mode       : {'DRY-RUN (no writes)' if dry_run else 'LIVE'}")
    print(f"{'='*60}\n")

    src_conn = None
    tgt_conn = None

    try:
        # ── 連線 ──
        print("Connecting to source DB...")
        src_conn = psycopg2.connect(source_url)
        src_conn.set_session(readonly=True, autocommit=True)

        if not dry_run:
            print("Connecting to target DB...")
            tgt_conn = psycopg2.connect(target_url)

        # ── Schema 偵測 ──
        columns      = get_columns(src_conn, table_name)
        pk_columns   = get_primary_keys(src_conn, table_name)
        serial_cols  = get_serial_columns(src_conn, table_name)
        jsonb_cols   = get_jsonb_columns(src_conn, table_name)
        time_col     = time_column or detect_time_column(table_name, columns)
        has_serial   = bool(serial_cols & set(pk_columns))
        jsonb_indices = {i for i, c in enumerate(columns) if c in jsonb_cols}

        if len(pk_columns) > 1:
            raise ValueError(
                f"Table '{table_name}' has a composite PK {pk_columns}, "
                f"which is not supported by keyset pagination."
            )
        pk_col = pk_columns[0]

        print(f"Columns     : {columns}")
        print(f"PK column   : {pk_col}")
        print(f"Time column : {time_col}")
        if serial_cols:
            print(f"Serial cols : {sorted(serial_cols)}")
        if jsonb_cols:
            print(f"JSONB cols  : {sorted(jsonb_cols)}")
        print()

        if time_col not in columns:
            raise ValueError(f"Time column '{time_col}' not found in table '{table_name}'.")

        # ── 計算總筆數 ──
        total = count_rows(src_conn, table_name, time_col, start, end)
        print(f"Rows to sync: {total:,}")

        if total == 0:
            print("Nothing to sync. Done.")
            return

        if dry_run:
            print("Dry-run mode: skipping actual write.")
            return

        # ── 建立 INSERT SQL 與 per-row template ──
        insert_sql   = build_insert_sql(table_name, columns, pk_columns, has_serial)
        row_template = build_row_template(columns, jsonb_cols)
        if verbose:
            print(f"Insert SQL  : {insert_sql}")
            print(f"Row template: {row_template}\n")

        # ── 欄位索引（供游標提取用）──
        time_col_idx = columns.index(time_col)
        pk_col_idx   = columns.index(pk_col)

        # ── Keyset 批次同步 ──
        cursor_time    = None
        cursor_pk      = None
        processed      = 0
        total_inserted = 0
        total_skipped  = 0
        batch_num      = 0

        while True:
            batch_num += 1
            rows = fetch_batch_keyset(
                src_conn, table_name, columns, jsonb_cols,
                time_col, pk_col,
                start, end,
                cursor_time, cursor_pk,
                batch_size,
            )
            if not rows:
                break

            # 更新游標至本批最後一列
            last_row    = rows[-1]
            cursor_time = last_row[time_col_idx]
            cursor_pk   = last_row[pk_col_idx]

            inserted = insert_batch(tgt_conn, insert_sql, rows, row_template)
            skipped  = len(rows) - inserted
            total_inserted += inserted
            total_skipped  += skipped
            processed      += len(rows)

            pct = min(processed / total * 100, 100)
            print(
                f"  Batch {batch_num:4d} | processed {processed:8,}/{total:,} "
                f"| inserted {inserted:5,} | skipped {skipped:5,} | {pct:.1f}%"
            )

        # ── 結果摘要 ──
        print(f"\n{'─'*60}")
        print(f"  Total fetched  : {processed:,}")
        print(f"  Total inserted : {total_inserted:,}")
        print(f"  Total skipped  : {total_skipped:,} (PK conflict)")
        print(f"{'─'*60}")

    finally:
        if src_conn:
            src_conn.close()
        if tgt_conn:
            tgt_conn.close()


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_datetime(s: str) -> datetime.datetime:
    """支援 ISO 8601 格式，沒有時區時視為 UTC"""
    try:
        dt = datetime.datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt
    except ValueError:
        raise argparse.ArgumentTypeError(
            f"Invalid datetime format: '{s}'. Use ISO 8601, e.g. '2025-01-01T00:00:00+00:00'"
        )


def main():
    parser = argparse.ArgumentParser(
        description="Batch sync a PostgreSQL table between two databases (skip on PK conflict).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # ── 連線 ──
    conn_group = parser.add_argument_group("Connection")
    conn_group.add_argument(
        "--source-url",
        required=True,
        metavar="URL",
        help="Source DB connection URL, e.g. postgresql://user:pass@host:5432/db",
    )
    conn_group.add_argument(
        "--target-url",
        required=True,
        metavar="URL",
        help="Target DB connection URL",
    )

    # ── 同步範圍 ──
    sync_group = parser.add_argument_group("Sync parameters")
    sync_group.add_argument(
        "--table",
        required=True,
        metavar="TABLE",
        help="Table name to sync",
    )
    sync_group.add_argument(
        "--start",
        required=True,
        type=parse_datetime,
        metavar="DATETIME",
        help="Start time (inclusive), ISO 8601 format. e.g. '2025-01-01T00:00:00+00:00'",
    )
    sync_group.add_argument(
        "--end",
        required=True,
        type=parse_datetime,
        metavar="DATETIME",
        help="End time (exclusive), ISO 8601 format. e.g. '2025-01-02T00:00:00+00:00'",
    )
    sync_group.add_argument(
        "--time-column",
        default=None,
        metavar="COLUMN",
        help=(
            "Column used for time-range filtering. "
            f"Auto-detected if omitted. Defaults: {TABLE_TIME_COLUMNS}"
        ),
    )
    sync_group.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        metavar="N",
        help="Number of rows per batch (default: 1000)",
    )

    # ── 行為控制 ──
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count rows only, do not write to target DB",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print extra debug info (e.g. INSERT SQL)",
    )

    args = parser.parse_args()

    if args.start >= args.end:
        parser.error("--start must be earlier than --end")

    try:
        sync(
            source_url=args.source_url,
            target_url=args.target_url,
            table_name=args.table,
            start=args.start,
            end=args.end,
            time_column=args.time_column,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            verbose=args.verbose,
        )
    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
