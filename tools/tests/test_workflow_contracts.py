from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CRAWLER = ROOT / ".github" / "workflows" / "crawler.yml"
REBUILD = ROOT / ".github" / "workflows" / "rebuild-relationships.yml"


def test_crawler_is_import_only_and_scoped_by_domain() -> None:
    workflow = CRAWLER.read_text(encoding="utf-8")

    assert "group: talent-graph-crawler-${{ inputs.domain || '人工智能' }}" in workflow
    assert "python -m data_pipeline.scripts.initial_import" in workflow
    assert "rebuild_relations_and_scores" not in workflow


def test_relationship_rebuild_is_an_independent_manual_workflow() -> None:
    workflow = REBUILD.read_text(encoding="utf-8")

    assert "workflow_dispatch:" in workflow
    assert "group: talent-graph-relationship-rebuild" in workflow
    assert "SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}" in workflow
    assert "python -m pip install -r tools/data_pipeline/requirements.txt" in workflow
    assert "rebuild_relations_and_scores" in workflow
