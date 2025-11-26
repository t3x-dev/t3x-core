"""
Draft Workflow 模块

实现完整的 6 步 Draft 流程：
1. 哈希窗口选择（Hash Window Selection）
2. Intent & Bridge 加载
3. 嵌入筛选（Embedding Filtering）
4. Polish（LLM 生成）
5. Validate 循环（Must-Have / Mustn't-Have 验证）
6. 用户审核（User Review）

核心原则：
- 步骤 1/2/3/5 由 Core 决定论执行
- 步骤 4/6 由 Agentic Layer（SummaryAgent）负责
"""

from .workflow import DraftWorkflow, DraftConfig, DraftResult
from .validator import MustHaveValidator, ValidationResult

__all__ = [
    "DraftWorkflow",
    "DraftConfig",
    "DraftResult",
    "MustHaveValidator",
    "ValidationResult",
]
