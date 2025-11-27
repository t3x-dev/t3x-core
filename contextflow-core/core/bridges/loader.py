"""
Bridge template loader

Load Bridge configuration and prompt templates from YAML files.
"""

from __future__ import annotations

import yaml
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

# Global default threshold
DEFAULT_THRESHOLD = 0.60

# Built-in default Bridge template directory (for initialization copy)
BUILTIN_BRIDGES_DIR = Path(__file__).parent.parent.parent / "configs" / "bridges"


@dataclass(frozen=True)
class BridgeTemplate:
    """
    Bridge template data class

    Corresponds to fields in YAML file:
    - bridge: Bridge ID (required)
    - label: Human-readable name (optional)
    - version: Version number (optional)
    - locale: Language (optional)
    - threshold: Similarity threshold (optional, default 0.60)
    - description: Description (optional)
    - prompt: Prompt template (required)
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
        Load Bridge template from YAML file

        Args:
            path: YAML file path

        Returns:
            BridgeTemplate instance

        Raises:
            ValueError: If required fields are missing
            FileNotFoundError: If file does not exist
        """
        if not path.exists():
            raise FileNotFoundError(f"Bridge YAML not found: {path}")

        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        # Validate required fields
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
        """Convert to dictionary (for serialization)"""
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
    Bridge template loader

    Supports:
    1. Load all Bridges from default directory
    2. Load Bridges from custom directory
    3. Find Bridge by ID
    4. Threshold override (CLI parameter > config.json > Bridge YAML > global default)
    """

    def __init__(self, bridges_dir: Optional[Path] = None, project_root: Optional[Path] = None):
        """
        Initialize loader

        Args:
            bridges_dir: Bridge YAML file directory
                        If None, defaults to {project_root}/.contextflow/bridges/
            project_root: Project root directory (defaults to current working directory)
        """
        if bridges_dir is None:
            # Per documentation, default reads .contextflow/bridges/
            self.project_root = project_root or Path.cwd()
            self.bridges_dir = self.project_root / ".contextflow" / "bridges"
        else:
            self.bridges_dir = bridges_dir
            self.project_root = project_root or Path.cwd()

        self.templates: Dict[str, BridgeTemplate] = {}

        # If directory does not exist, initialize from built-in templates
        if not self.bridges_dir.exists():
            self._init_default_bridges()

        self._load_all()

    def _init_default_bridges(self):
        """
        Copy default Bridges from built-in template directory to .contextflow/bridges/

        Per docs/ARCHITECTURE.zh.md:176,
        CLI initialization copies default Bridge templates to user's .contextflow/bridges/
        for easy editing and customization.
        """
        import shutil

        # Create target directory
        self.bridges_dir.mkdir(parents=True, exist_ok=True)

        # Check if built-in template directory exists
        if not BUILTIN_BRIDGES_DIR.exists():
            print(f"Warning: Builtin bridges directory not found: {BUILTIN_BRIDGES_DIR}")
            print(f"Creating empty bridges directory: {self.bridges_dir}")
            return

        # Copy all YAML files
        copied_count = 0
        for yaml_file in BUILTIN_BRIDGES_DIR.glob("*.yaml"):
            dest_file = self.bridges_dir / yaml_file.name
            shutil.copy2(yaml_file, dest_file)
            copied_count += 1
            print(f"Initialized bridge: {yaml_file.name} -> {dest_file}")

        if copied_count == 0:
            print(f"Warning: No bridge templates found in {BUILTIN_BRIDGES_DIR}")
        else:
            print(f"Initialized {copied_count} default bridge templates in {self.bridges_dir}")

    def _load_all(self):
        """Load all Bridge YAML files from directory"""
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
                # Log warning but don't interrupt loading
                print(f"Warning: Failed to load bridge {yaml_file}: {e}")

    def get(self, bridge_id: str) -> Optional[BridgeTemplate]:
        """
        Get Bridge template for specified ID

        Args:
            bridge_id: Bridge ID (e.g., "plan", "explain")

        Returns:
            BridgeTemplate or None (if does not exist)
        """
        return self.templates.get(bridge_id)

    def get_with_threshold(
        self,
        bridge_id: str,
        cli_threshold: Optional[float] = None,
        config_threshold: Optional[float] = None,
    ) -> tuple[Optional[BridgeTemplate], float]:
        """
        Get Bridge template and resolve threshold

        Threshold priority:
        1. CLI temporary parameter (cli_threshold)
        2. Project configuration (config_threshold)
        3. Threshold in Bridge YAML
        4. Global default value (0.60)

        Args:
            bridge_id: Bridge ID
            cli_threshold: Threshold specified by CLI parameter
            config_threshold: Threshold from config.json

        Returns:
            (BridgeTemplate, effective_threshold)
        """
        template = self.get(bridge_id)
        if template is None:
            return None, DEFAULT_THRESHOLD

        # Apply priority rules
        effective_threshold = (
            cli_threshold
            or config_threshold
            or template.threshold
            or DEFAULT_THRESHOLD
        )

        return template, effective_threshold

    def list_bridges(self) -> list[str]:
        """Return list of all available Bridge IDs"""
        return list(self.templates.keys())

    def reload(self):
        """Reload all Bridges (for hot updates)"""
        self.templates.clear()
        self._load_all()
