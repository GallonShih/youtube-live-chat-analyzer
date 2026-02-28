import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import psycopg2


# ── 設定 ────────────────────────────────────────────────────────────────────

PATTERN = re.compile(r'([\u4e00-\u9fff]{2,6})代表上香')
ENV_PATH = Path(__file__).parent.parent / '.env'


def load_env(path: Path) -> dict:
    """從 .env 檔讀取 key=value，忽略註解與空行。"""
    env = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        env[k.strip()] = v.strip()
    return env


def get_connection():
    env = load_env(ENV_PATH)
    return psycopg2.connect(
        host=env.get('POSTGRES_HOST', 'localhost'),
        port=int(env.get('POSTGRES_PORT', 5432)),
        dbname=env.get('POSTGRES_DB', 'hermes'),
        user=env.get('POSTGRES_USER', 'hermes'),
        password=env.get('POSTGRES_PASSWORD', 'hermes'),
    )


# ── 主程式入口 ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='地區上香分析工具')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('extract', help='提取候選地區詞')
    p_analyze = sub.add_parser('analyze', help='分析已核准地區分布')
    p_analyze.add_argument(
        '--approved',
        default='approved_regions.json',
        help='核准地區 JSON 檔路徑（預設: approved_regions.json）',
    )
    args = parser.parse_args()

    if args.command == 'extract':
        cmd_extract()
    elif args.command == 'analyze':
        cmd_analyze(args.approved)


if __name__ == '__main__':
    main()
