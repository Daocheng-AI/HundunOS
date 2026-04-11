# Task Scientist 测试脚本
# 使用方法: 将 JSON 输入通过管道传递给 task-scientist.exe

# 测试 1: 创建任务
echo '{"action":"CreateTask","task_id":"test_001","description":{"title":"测试任务","description":"这是一个测试任务","initial_code":"console.log(''hello'')","stages":[]}}' | .\target\release\task-scientist.exe

# 测试 2: 获取配置
echo '{"action":"GetConfig"}' | .\target\release\task-scientist.exe

# 测试 3: 列出任务
echo '{"action":"ListTasks"}' | .\target\release\task-scientist.exe
