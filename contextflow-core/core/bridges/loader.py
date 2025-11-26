"""
Bridge 模板加载器

从 YAML 文件加载 Bridge 配置和提示词模板。
"""

from __future__ import annotations

import yaml
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

# 全局默认阈值
DEFAULT_THRESHOLD = 0.60

# 内置默认 Bridge 模板目录（用于初始化拷贝）
BUILTIN_BRIDGES_DIR = Path(__file__).parent.parent.parent / "configs" / "bridges"


@dataclass(frozen=True)
class BridgeTemplate:
    """
    Bridge 模板数据类

    对应 YAML 文件中的字段：
    - bridge: Bridge ID（必填）
    - label: 人类可读名称（可选）
    - version: 版本号（可选）
    - locale: 语言（可选）
    - threshold: 相似度阈值（可选，默认 0.60）
    - description: 描述（可选）
    - prompt: 提示词模板（必填）
    """

    bridge: str
    prompt: str
    label: Optional[str] = None
    version: Optional[int] = None
    locale: Optional[str] = None
    threshold: float = DEFAULT_THRESHOLD
    description: Optional[str] = None

    @classmethod
    def from_yaml(cls, path: Path) -> BridgeTemplate:
        """
        从 YAML 文件加载 Bridge 模板

        Args:
            path: YAML 文件路径

        Returns:
            BridgeTemplate 实例

        Raises:
            ValueError: 如果缺少必填字段
            FileNotFoundError: 如果文件不存在
        """
        if not path.exists():
            raise FileNotFoundError(f"Bridge YAML not found: {path}")

        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        # 验证必填字段
        if "bridge" not in data:
            raise ValueError(f"Missing required field 'bridge' in {path}")
        if "prompt" not in data:
            raise ValueError(f"Missing required field 'prompt' in {path}")

        return cls(
            bridge=data["bridge"],
            prompt=data["prompt"],
            label=data.get("label"),
            version=data.get("version"),
            locale=data.get("locale"),
            threshold=data.get("threshold", DEFAULT_THRESHOLD),
            description=data.get("description"),
        )

    def to_dict(self) -> Dict:
        """转换为字典（用于序列化）"""
        return {
            "bridge": self.bridge,
            "label": self.label,
            "version": self.version,
            "locale": self.locale,
            "threshold": self.threshold,
            "description": self.description,
            "prompt": self.prompt,
        }


class BridgeLoader:
    """
    Bridge 模板加载器

    支持：
    1. 从默认目录加载所有 Bridge
    2. 从自定义目录加载 Bridge
    3. 按 ID 查找 Bridge
    4. 阈值覆盖（CLI 参数 > config.json > Bridge YAML > 全局默认）
    """

    def __init__(self, bridges_dir: Optional[Path] = None, project_root: Optional[Path] = None):
        """
        初始化加载器

        Args:
            bridges_dir: Bridge YAML 文件目录
                        如果为 None，默认为 {project_root}/.contextflow/bridges/
            project_root: 项目根目录（默认为当前工作目录）
        """
        if bridges_dir is None:
            # 按文档要求，默认读取 .contextflow/bridges/
            self.project_root = project_root or Path.cwd()
            self.bridges_dir = self.project_root / ".contextflow" / "bridges"
        else:
            self.bridges_dir = bridges_dir
            self.project_root = project_root or Path.cwd()

        self.templates: Dict[str, BridgeTemplate] = {}

        # 如果目录不存在，从内置模板初始化
        if not self.bridges_dir.exists():
            self._init_default_bridges()

        self._load_all()

    def _init_default_bridges(self):
        """
        从内置模板目录拷贝默认 Bridge 到 .contextflow/bridges/

        按照 docs/ARCHITECTURE.zh.md:176 的要求，
        CLI 初始化时将默认 Bridge 模板拷贝到用户的 .contextflow/bridges/，
        便于用户编辑和自定义。
        """
        import shutil

        # 创建目标目录
        self.bridges_dir.mkdir(parents=True, exist_ok=True)

        # 检查内置模板目录是否存在
        if not BUILTIN_BRIDGES_DIR.exists():
            print(f"Warning: Builtin bridges directory not found: {BUILTIN_BRIDGES_DIR}")
            print(f"Creating empty bridges directory: {self.bridges_dir}")
            return

        # 拷贝所有 YAML 文件
        copied_count = 0
        for yaml_file in BUILTIN_BRIDGES_DIR.glob("*.yaml"):
            dest_file = self.bridges_dir / yaml_file.name
            shutil.copy2(yaml_file, dest_file)
            copied_count += 1
            print(f"Initialized bridge: {yaml_file.name} -> {dest_file}")

        if copied_count == 0:
            print(f"Warning: No bridge templates found in {BUILTIN_BRIDGES_DIR}")
        else:
            print(f"✅ Initialized {copied_count} default bridge templates in {self.bridges_dir}")

    def _load_all(self):
        """从目录加载所有 Bridge YAML 文件"""
        if not self.bridges_dir.exists():
            raise FileNotFoundError(
                f"Bridges directory not found: {self.bridges_dir}\n"
                f"Please create it and add bridge YAML files."
            )

        for yaml_file in self.bridges_dir.glob("*.yaml"):
            try:
                template = BridgeTemplate.from_yaml(yaml_file)
                self.templates[template.bridge] = template
            except Exception as e:
                # 记录警告但不中断加载
                print(f"Warning: Failed to load bridge {yaml_file}: {e}")

    def get(self, bridge_id: str) -> Optional[BridgeTemplate]:
        """
        获取指定 ID 的 Bridge 模板

        Args:
            bridge_id: Bridge ID（如 "plan", "explain"）

        Returns:
            BridgeTemplate 或 None（如果不存在）
        """
        return self.templates.get(bridge_id)

    def get_with_threshold(
        self,
        bridge_id: str,
        cli_threshold: Optional[float] = None,
        config_threshold: Optional[float] = None,
    ) -> tuple[Optional[BridgeTemplate], float]:
        """
        获取 Bridge 模板并解析阈值

        阈值优先级：
        1. CLI 临时参数（cli_threshold）
        2. 项目配置（config_threshold）
        3. Bridge YAML 里的 threshold
        4. 全局默认值（0.60）

        Args:
            bridge_id: Bridge ID
            cli_threshold: CLI 参数指定的阈值
            config_threshold: config.json 中的阈值

        Returns:
            (BridgeTemplate, effective_threshold)
        """
        template = self.get(bridge_id)
        if template is None:
            return None, DEFAULT_THRESHOLD

        # 应用优先级规则
        effective_threshold = (
            cli_threshold
            or config_threshold
            or template.threshold
            or DEFAULT_THRESHOLD
        )

        return template, effective_threshold

    def list_bridges(self) -> list[str]:
        """返回所有可用的 Bridge ID 列表"""
        return list(self.templates.keys())

    def reload(self):
        """重新加载所有 Bridge（用于热更新）"""
        self.templates.clear()
        self._load_all()
