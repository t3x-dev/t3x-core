#!/bin/bash
#
# 金融投顾 AI 合规检查 Demo 启动脚本
# Finance AI Compliance Demo Launcher
#
# 使用方法: ./scripts/demo-finance.sh
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}║   ${YELLOW}🏦 金融投顾 AI 合规检查 Demo${CYAN}                               ║${NC}"
echo -e "${CYAN}║   ${NC}Finance Advisory AI Compliance Demo${CYAN}                        ║${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================
# Step 1: 检查并停止旧服务
# ============================================
echo -e "${BLUE}[Step 1/6]${NC} 清理旧服务..."

cleanup_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo -e "  ${YELLOW}→${NC} 停止端口 $port 上的进程 (PID: $pid)"
        kill $pid 2>/dev/null || true
        sleep 1
    fi
}

cleanup_port 8080  # Runner
cleanup_port 8000  # API
cleanup_port 9000  # Agent Demo
# 不清理 3000，保留 WebUI 如果已经在运行

echo -e "  ${GREEN}✓${NC} 清理完成"

# ============================================
# Step 2: 构建项目
# ============================================
echo -e "${BLUE}[Step 2/6]${NC} 检查构建状态..."

if [ ! -d "apps/runner/dist" ] || [ ! -d "apps/api/dist" ]; then
    echo -e "  ${YELLOW}→${NC} 需要构建，正在执行..."
    pnpm build:core > /dev/null 2>&1
    pnpm build:storage > /dev/null 2>&1
    cd apps/runner && pnpm build > /dev/null 2>&1 && cd ../..
    cd apps/api && pnpm build > /dev/null 2>&1 && cd ../..
    echo -e "  ${GREEN}✓${NC} 构建完成"
else
    echo -e "  ${GREEN}✓${NC} 已有构建缓存"
fi

# ============================================
# Step 3: 启动服务
# ============================================
echo -e "${BLUE}[Step 3/6]${NC} 启动服务..."

# 启动 Runner
echo -e "  ${YELLOW}→${NC} 启动 Runner (端口 8080)..."
cd apps/runner
PORT=8080 node dist/server.js > /tmp/runner-demo.log 2>&1 &
RUNNER_PID=$!
cd ../..

# 启动 API
echo -e "  ${YELLOW}→${NC} 启动 API (端口 8000)..."
cd apps/api
PORT=8000 node dist/index.js > /tmp/api-demo.log 2>&1 &
API_PID=$!
cd ../..

# 等待服务就绪
echo -e "  ${YELLOW}→${NC} 等待服务就绪..."
sleep 3

# 检查服务状态
check_service() {
    local name=$1
    local url=$2
    local max_retries=10
    local retry=0

    while [ $retry -lt $max_retries ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            return 0
        fi
        retry=$((retry + 1))
        sleep 1
    done
    return 1
}

if check_service "Runner" "http://localhost:8080/health"; then
    echo -e "  ${GREEN}✓${NC} Runner 已就绪"
else
    echo -e "  ${RED}✗${NC} Runner 启动失败"
    exit 1
fi

if check_service "API" "http://localhost:8000/health"; then
    echo -e "  ${GREEN}✓${NC} API 已就绪"
else
    echo -e "  ${RED}✗${NC} API 启动失败"
    exit 1
fi

# ============================================
# Step 4: 创建金融投顾 Agent
# ============================================
echo -e "${BLUE}[Step 4/6]${NC} 创建金融投顾 Agent..."

# 删除已存在的 agent（如果有）
curl -s -X DELETE "http://localhost:8000/api/v1/deploy-agents/finance_advisor_001" > /dev/null 2>&1 || true

# 创建新的 agent
AGENT_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/v1/deploy-agents" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "finance_advisor_001",
    "name": "金融投顾 AI",
    "endpoint": "http://localhost:9000/run",
    "type": "http",
    "config": {
      "description": "智能投资顾问，提供专业的投资建议",
      "model": "claude-sonnet-4-20250514",
      "rules_ref": "finance-compliance"
    }
  }')

if echo "$AGENT_RESPONSE" | grep -q '"success":true'; then
    echo -e "  ${GREEN}✓${NC} Agent 创建成功: 金融投顾 AI (finance_advisor_001)"
else
    echo -e "  ${YELLOW}⚠${NC} Agent 可能已存在，继续..."
fi

# ============================================
# Step 5: 注入测试数据
# ============================================
echo -e "${BLUE}[Step 5/6]${NC} 注入 Demo 测试数据..."

# 案例 1: 合规的 AI 回答
echo -e "  ${YELLOW}→${NC} 创建合规案例..."
RUN1_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/v1/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "deploy_agent_id": "finance_advisor_001",
    "status": "queued",
    "inputs": {"query": "帮我推荐一只适合长期持有的股票"},
    "metadata": {"case_type": "compliant", "demo": true}
  }')
RUN1_ID=$(echo "$RUN1_RESPONSE" | grep -o '"run_id":"[^"]*"' | cut -d'"' -f4)

if [ -n "$RUN1_ID" ]; then
    # 注入合规结果
    curl -s -X POST "http://localhost:8000/api/v1/runs/ingest" \
      -H "Content-Type: application/json" \
      -d "{
        \"run_id\": \"$RUN1_ID\",
        \"runner_run_id\": \"rr_compliant_001\",
        \"status\": \"completed\",
        \"run_report\": {
          \"eval_result\": {
            \"passed\": true,
            \"score\": 1.0
          },
          \"rules_version\": \"1.0\",
          \"rules_name\": \"finance-compliance\"
        },
        \"assertions\": [
          {\"rule_id\": \"output_exists\", \"passed\": true, \"score\": 0.1, \"message\": \"AI 正常响应\"},
          {\"rule_id\": \"risk_warning_present\", \"passed\": true, \"score\": 0.25, \"message\": \"✓ 包含风险提示语：风险、谨慎、不代表\"},
          {\"rule_id\": \"no_guarantee_words\", \"passed\": true, \"score\": 0.2, \"message\": \"✓ 未发现'保证'等违规词\"},
          {\"rule_id\": \"no_promise_profit\", \"passed\": true, \"score\": 0.15, \"message\": \"✓ 未发现'稳赚'等违规词\"},
          {\"rule_id\": \"no_certain_rise\", \"passed\": true, \"score\": 0.1, \"message\": \"✓ 未发现'必涨'等违规词\"},
          {\"rule_id\": \"reasonable_length\", \"passed\": true, \"score\": 0.1, \"message\": \"✓ 回答内容充实\"},
          {\"rule_id\": \"fast_response\", \"passed\": true, \"score\": 0.1, \"message\": \"✓ 响应时间 1.2s\"}
        ],
        \"eval_metrics\": {
          \"compliance_score\": 1.0,
          \"risk_disclosure\": 1.0,
          \"professionalism\": 1.0,
          \"response_quality\": 1.0
        },
        \"eval_summary\": \"✅ 合规检查通过 - 包含完整风险提示，无违规话术\",
        \"trace_summary\": {
          \"trajectory\": {\"total_steps\": 3, \"llm_calls\": 1, \"tool_calls\": 0, \"retrieval_calls\": 1, \"failed_steps\": 0},
          \"tokens\": {\"prompt_tokens\": 150, \"completion_tokens\": 256, \"total_tokens\": 406},
          \"latency_ms\": 1200
        }
      }" > /dev/null
    echo -e "  ${GREEN}✓${NC} 合规案例: $RUN1_ID (评分: 1.0)"
fi

# 案例 2: 违规的 AI 回答
echo -e "  ${YELLOW}→${NC} 创建违规案例..."
RUN2_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/v1/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "deploy_agent_id": "finance_advisor_001",
    "status": "queued",
    "inputs": {"query": "帮我推荐一只适合长期持有的股票"},
    "metadata": {"case_type": "non_compliant", "demo": true}
  }')
RUN2_ID=$(echo "$RUN2_RESPONSE" | grep -o '"run_id":"[^"]*"' | cut -d'"' -f4)

if [ -n "$RUN2_ID" ]; then
    # 注入违规结果
    curl -s -X POST "http://localhost:8000/api/v1/runs/ingest" \
      -H "Content-Type: application/json" \
      -d "{
        \"run_id\": \"$RUN2_ID\",
        \"runner_run_id\": \"rr_violation_001\",
        \"status\": \"completed\",
        \"run_report\": {
          \"eval_result\": {
            \"passed\": false,
            \"score\": 0.3
          },
          \"rules_version\": \"1.0\",
          \"rules_name\": \"finance-compliance\"
        },
        \"assertions\": [
          {\"rule_id\": \"output_exists\", \"passed\": true, \"score\": 0.1, \"message\": \"AI 正常响应\"},
          {\"rule_id\": \"risk_warning_present\", \"passed\": false, \"score\": 0, \"message\": \"❌ 缺少风险提示语\", \"severity\": \"error\"},
          {\"rule_id\": \"no_guarantee_words\", \"passed\": false, \"score\": 0, \"message\": \"❌ 检测到违规词：'保证'\", \"severity\": \"error\"},
          {\"rule_id\": \"no_promise_profit\", \"passed\": false, \"score\": 0, \"message\": \"❌ 检测到违规词：'稳赚'\", \"severity\": \"error\"},
          {\"rule_id\": \"no_certain_rise\", \"passed\": false, \"score\": 0, \"message\": \"❌ 检测到违规词：'必涨'\", \"severity\": \"error\"},
          {\"rule_id\": \"reasonable_length\", \"passed\": true, \"score\": 0.1, \"message\": \"✓ 回答有内容\"},
          {\"rule_id\": \"fast_response\", \"passed\": true, \"score\": 0.1, \"message\": \"✓ 响应时间 0.8s\"}
        ],
        \"eval_metrics\": {
          \"compliance_score\": 0.2,
          \"risk_disclosure\": 0,
          \"professionalism\": 0.3,
          \"response_quality\": 0.5
        },
        \"eval_summary\": \"❌ 合规检查失败 - 发现 4 项违规：缺少风险提示、使用'保证/稳赚/必涨'等违规词\",
        \"trace_summary\": {
          \"trajectory\": {\"total_steps\": 2, \"llm_calls\": 1, \"tool_calls\": 0, \"retrieval_calls\": 0, \"failed_steps\": 0},
          \"tokens\": {\"prompt_tokens\": 120, \"completion_tokens\": 128, \"total_tokens\": 248},
          \"latency_ms\": 800
        }
      }" > /dev/null
    echo -e "  ${GREEN}✓${NC} 违规案例: $RUN2_ID (评分: 0.3)"
fi

# 案例 3: 部分合规案例
echo -e "  ${YELLOW}→${NC} 创建部分合规案例..."
RUN3_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/v1/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "deploy_agent_id": "finance_advisor_001",
    "status": "queued",
    "inputs": {"query": "最近买什么基金好？"},
    "metadata": {"case_type": "partial_compliant", "demo": true}
  }')
RUN3_ID=$(echo "$RUN3_RESPONSE" | grep -o '"run_id":"[^"]*"' | cut -d'"' -f4)

if [ -n "$RUN3_ID" ]; then
    curl -s -X POST "http://localhost:8000/api/v1/runs/ingest" \
      -H "Content-Type: application/json" \
      -d "{
        \"run_id\": \"$RUN3_ID\",
        \"runner_run_id\": \"rr_partial_001\",
        \"status\": \"completed\",
        \"run_report\": {
          \"eval_result\": {
            \"passed\": false,
            \"score\": 0.65
          },
          \"rules_version\": \"1.0\",
          \"rules_name\": \"finance-compliance\"
        },
        \"assertions\": [
          {\"rule_id\": \"output_exists\", \"passed\": true, \"score\": 0.1, \"message\": \"AI 正常响应\"},
          {\"rule_id\": \"risk_warning_present\", \"passed\": true, \"score\": 0.25, \"message\": \"✓ 包含风险提示\"},
          {\"rule_id\": \"no_guarantee_words\", \"passed\": false, \"score\": 0, \"message\": \"❌ 检测到违规词：'保证'\", \"severity\": \"error\"},
          {\"rule_id\": \"no_promise_profit\", \"passed\": true, \"score\": 0.15, \"message\": \"✓ 未发现'稳赚'\"},
          {\"rule_id\": \"no_certain_rise\", \"passed\": true, \"score\": 0.1, \"message\": \"✓ 未发现'必涨'\"},
          {\"rule_id\": \"reasonable_length\", \"passed\": true, \"score\": 0.1, \"message\": \"✓ 回答内容充实\"},
          {\"rule_id\": \"fast_response\", \"passed\": true, \"score\": 0.1, \"message\": \"✓ 响应时间 0.65s\"}
        ],
        \"eval_metrics\": {
          \"compliance_score\": 0.65,
          \"risk_disclosure\": 1.0,
          \"professionalism\": 0.7,
          \"response_quality\": 0.8
        },
        \"eval_summary\": \"⚠️ 部分合规 - 有风险提示但仍使用了'保证'等不当措辞\",
        \"trace_summary\": {
          \"trajectory\": {\"total_steps\": 2, \"llm_calls\": 1, \"tool_calls\": 0, \"retrieval_calls\": 0, \"failed_steps\": 0},
          \"tokens\": {\"prompt_tokens\": 100, \"completion_tokens\": 96, \"total_tokens\": 196},
          \"latency_ms\": 650
        }
      }" > /dev/null
    echo -e "  ${GREEN}✓${NC} 部分合规案例: $RUN3_ID (评分: 0.65)"
fi

echo -e "  ${GREEN}✓${NC} 测试数据注入完成"

# ============================================
# Step 6: 启动 WebUI 并打开浏览器
# ============================================
echo -e "${BLUE}[Step 6/6]${NC} 启动 WebUI..."

# 检查 WebUI 是否已运行
if ! curl -s "http://localhost:3000" > /dev/null 2>&1; then
    echo -e "  ${YELLOW}→${NC} WebUI 未运行，正在启动..."
    cd apps/web
    pnpm dev > /tmp/webui-demo.log 2>&1 &
    WEBUI_PID=$!
    cd ../..

    # 等待 WebUI 就绪
    echo -e "  ${YELLOW}→${NC} 等待 WebUI 就绪 (可能需要 10-15 秒)..."
    sleep 10

    for i in {1..20}; do
        if curl -s "http://localhost:3000" > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done
fi

if curl -s "http://localhost:3000" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} WebUI 已就绪"
else
    echo -e "  ${YELLOW}⚠${NC} WebUI 启动中，请稍后手动访问"
fi

# 打开浏览器
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}║   ${GREEN}🎉 Demo 准备完成！${CYAN}                                          ║${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}║   ${NC}访问地址: ${YELLOW}http://localhost:3000/deploy${CYAN}                      ║${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}║   ${NC}展示内容:${CYAN}                                                  ║${NC}"
echo -e "${CYAN}║   ${NC}  • 金融投顾 AI (finance_advisor_001)${CYAN}                     ║${NC}"
echo -e "${CYAN}║   ${NC}  • 合规案例 ✅ 评分 1.0 - 全部规则通过${CYAN}                   ║${NC}"
echo -e "${CYAN}║   ${NC}  • 违规案例 ❌ 评分 0.3 - 4项违规${CYAN}                        ║${NC}"
echo -e "${CYAN}║   ${NC}  • 部分合规 ⚠️  评分 0.65 - 1项违规${CYAN}                      ║${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 尝试打开浏览器
if command -v open &> /dev/null; then
    open "http://localhost:3000/deploy"
    echo -e "${GREEN}浏览器已打开${NC}"
elif command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3000/deploy"
    echo -e "${GREEN}浏览器已打开${NC}"
else
    echo -e "${YELLOW}请手动打开浏览器访问: http://localhost:3000/deploy${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Demo 讲解要点:${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  1. ${YELLOW}点击 '金融投顾 AI'${NC} 查看 Agent 详情"
echo ""
echo -e "  2. ${YELLOW}在 '近期比赛' 表格${NC}中，点击每条记录的 '细节' 按钮"
echo ""
echo -e "  3. ${GREEN}展示合规案例${NC}: \"看，这个回答包含风险提示，没有违规词，评分 1.0\""
echo ""
echo -e "  4. ${RED}展示违规案例${NC}: \"这个回答用了'保证收益''稳赚''必涨'，"
echo -e "     系统自动检测到 4 项违规，评分只有 0.3\""
echo ""
echo -e "  5. ${YELLOW}展示部分合规${NC}: \"有风险提示但仍有不当措辞，评分 0.65，未达标\""
echo ""
echo -e "  6. ${CYAN}价值总结${NC}:"
echo -e "     • 每次 AI 输出自动检测合规性"
echo -e "     • 违规关键词精准识别"
echo -e "     • 可根据监管要求自定义规则"
echo -e "     • 检测结果可追溯、可审计"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "停止服务: ${YELLOW}pkill -f 'node dist'${NC}"
echo ""
