from tools.migration.verify import VerificationReport, compare_counts, find_duplicate_ids


def test_verification_report_fails_on_count_mismatch_or_orphans():
    report = VerificationReport()
    report.count_mismatches = compare_counts(
        {"persons": 2, "organizations": 1},
        {"persons": 1, "organizations": 1},
    )
    report.orphans = {"persons.current_organization_id": ["missing-org"]}

    payload = report.to_dict()

    assert report.ok is False
    assert payload["ok"] is False
    assert payload["count_mismatches"]["persons"] == {"source": 2, "target": 1}


def test_duplicate_detection_is_deterministic():
    rows = [{"id": "b"}, {"id": "a"}, {"id": "b"}, {"id": "a"}]
    assert find_duplicate_ids(rows) == ["a", "b"]
