"""
Airflow DAG: Hourly Message Count
每5分钟计算当前小时和前一小时的YouTube直播聊天消息数量
"""

from datetime import datetime, timedelta
from pathlib import Path
import os
import re

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook

# 默认参数
default_args = {
    'owner': 'hermes',
    'depends_on_past': False,
    'start_date': datetime(2025, 10, 6),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=1),
}

# DAG 定义
dag = DAG(
    'hourly_message_count',
    default_args=default_args,
    description='Calculate hourly message count from YouTube live chat',
    schedule_interval='*/5 * * * *',  # 每5分钟执行
    catchup=False,
    tags=['etl', 'statistics'],
)


def load_config(**context):
    """
    Task 1: 载入环境变量和配置
    """
    youtube_url = os.getenv('YOUTUBE_URL', '')

    # 从 YouTube URL 提取 video_id (live_stream_id)
    # 支持格式: https://www.youtube.com/watch?v=VIDEO_ID
    match = re.search(r'(?:v=|/)([a-zA-Z0-9_-]{11})', youtube_url)

    if not match:
        raise ValueError(f"Invalid YouTube URL: {youtube_url}")

    live_stream_id = match.group(1)

    config = {
        'youtube_url': youtube_url,
        'live_stream_id': live_stream_id,
        'db_conn_id': 'postgres_hermes'
    }

    print(f"Loaded config: {config}")

    # 推送到 XCom
    context['task_instance'].xcom_push(key='config', value=config)

    return config


def create_table_if_not_exists(**context):
    """
    Task 2: 创建表（如果不存在）
    """
    config = context['task_instance'].xcom_pull(task_ids='load_config', key='config')

    # 读取 SQL 文件
    sql_file_path = Path(__file__).parent / 'sql' / 'create_hourly_message_stats.sql'
    sql = sql_file_path.read_text()

    # 使用 PostgresHook 执行 SQL
    pg_hook = PostgresHook(postgres_conn_id=config['db_conn_id'])
    pg_hook.run(sql)

    print("Table hourly_message_stats created or already exists")

    return True


def calculate_hourly_counts(**context):
    """
    Task 3: 计算当前小时和前一小时的消息数量
    """
    # 从 XCom 获取配置
    config = context['task_instance'].xcom_pull(task_ids='load_config', key='config')
    live_stream_id = config['live_stream_id']

    # 获取数据库连接 (使用连接池)
    pg_hook = PostgresHook(postgres_conn_id=config['db_conn_id'])

    # 获取当前时间并截断到小时
    now = datetime.now()
    current_hour = now.replace(minute=0, second=0, microsecond=0)
    previous_hour = current_hour - timedelta(hours=1)

    # SQL 查询：计算两个小时的消息数
    sql = """
        SELECT
            DATE_TRUNC('hour', published_at) as hour_timestamp,
            COUNT(*) as message_count
        FROM chat_messages
        WHERE live_stream_id = %s
            AND published_at >= %s
            AND published_at < %s
        GROUP BY DATE_TRUNC('hour', published_at)
        ORDER BY hour_timestamp;
    """

    # 执行查询 (自动从连接池获取连接)
    results = pg_hook.get_records(
        sql,
        parameters=(live_stream_id, previous_hour, current_hour + timedelta(hours=1))
    )

    # 处理结果
    hourly_data = {}
    for row in results:
        hour_ts, count = row
        hourly_data[hour_ts] = count

    # 构建返回数据（确保两个小时都有数据，没有的话设为0）
    result = {
        'current_hour': {
            'timestamp': current_hour,
            'count': hourly_data.get(current_hour, 0)
        },
        'previous_hour': {
            'timestamp': previous_hour,
            'count': hourly_data.get(previous_hour, 0)
        },
        'live_stream_id': live_stream_id
    }

    print(f"Calculated hourly counts: {result}")

    # 推送到 XCom
    context['task_instance'].xcom_push(key='hourly_counts', value=result)

    return result


def upsert_hourly_stats(**context):
    """
    Task 4: 更新或插入统计结果到数据库
    """
    # 从 XCom 获取数据
    config = context['task_instance'].xcom_pull(task_ids='load_config', key='config')
    hourly_counts = context['task_instance'].xcom_pull(task_ids='calculate_hourly_counts', key='hourly_counts')

    # 获取数据库连接 (使用连接池)
    pg_hook = PostgresHook(postgres_conn_id=config['db_conn_id'])

    # UPSERT SQL
    upsert_sql = """
        INSERT INTO hourly_message_stats
            (live_stream_id, hour_timestamp, message_count, created_at, updated_at)
        VALUES (%s, %s, %s, NOW(), NOW())
        ON CONFLICT (live_stream_id, hour_timestamp)
        DO UPDATE SET
            message_count = EXCLUDED.message_count,
            updated_at = NOW();
    """

    live_stream_id = hourly_counts['live_stream_id']

    # 插入/更新当前小时数据
    current = hourly_counts['current_hour']
    pg_hook.run(
        upsert_sql,
        parameters=(live_stream_id, current['timestamp'], current['count'])
    )
    print(f"Upserted current hour: {current['timestamp']} - {current['count']} messages")

    # 插入/更新前一小时数据
    previous = hourly_counts['previous_hour']
    pg_hook.run(
        upsert_sql,
        parameters=(live_stream_id, previous['timestamp'], previous['count'])
    )
    print(f"Upserted previous hour: {previous['timestamp']} - {previous['count']} messages")

    return {
        'current_hour_count': current['count'],
        'previous_hour_count': previous['count']
    }


# Task 1: 载入配置
task_load_config = PythonOperator(
    task_id='load_config',
    python_callable=load_config,
    dag=dag,
)

# Task 2: 创建表（如果不存在）- 改用 PythonOperator
task_create_table = PythonOperator(
    task_id='create_table_if_not_exists',
    python_callable=create_table_if_not_exists,
    dag=dag,
)

# Task 3: 计算小时统计
task_calculate = PythonOperator(
    task_id='calculate_hourly_counts',
    python_callable=calculate_hourly_counts,
    dag=dag,
)

# Task 4: 更新数据库
task_upsert = PythonOperator(
    task_id='upsert_hourly_stats',
    python_callable=upsert_hourly_stats,
    dag=dag,
)

# 定义任务依赖
task_load_config >> task_create_table >> task_calculate >> task_upsert
