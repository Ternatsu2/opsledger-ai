DEMO_POLICY = {
    "version": "2026-08-13.1",
    "purpose": (
        "A synthetic financing-readiness checklist for the OpsLedger buildathon demo. "
        "It is not a lending, legal, or regulatory policy."
    ),
    "required_documents": [
        "REGISTRATION_EVIDENCE",
        "REVENUE_STATEMENT",
        "BANK_STATEMENT",
        "OWNERSHIP_DECLARATION",
    ],
    "financial_evidence_max_age_days": 180,
    "supported_currencies": ["XCD", "USD", "BBD", "JMD", "TTD"],
    "legal_name_similarity_threshold": 0.92,
    "revenue_total_tolerance": 1.0,
    "human_control": (
        "A reviewer approves consequential workflow actions. The agent can prepare a "
        "recommendation or a draft request for information."
    ),
}
