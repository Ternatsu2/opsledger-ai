from pathlib import Path

from opsledger.config import _project_root


def test_project_root_supports_repository_and_container_layouts() -> None:
    assert _project_root(Path("/workspace/apps/api")) == Path("/workspace")
    assert _project_root(Path("/app")) == Path("/app")
