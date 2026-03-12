-- Constitutional Shrinkage Database Schema
-- 007_legislation_git_tracking.sql - Full git-style commit history and blame for legislation
-- Every line of every law must be traceable to the person who wrote it.
-- Generated: 2026-03-12

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE legislation_change_type AS ENUM (
    'DRAFT',
    'AMENDMENT',
    'EDIT',
    'ADDITION',
    'REMOVAL',
    'RESTRUCTURE',
    'MERGE',
    'RATIFICATION',
    'REPEAL',
    'SUNSET',
    'ENDORSEMENT'
);

-- ============================================================================
-- LEGISLATION COMMITS TABLE
-- The atomic unit of change — every edit to every bill is a commit.
-- ============================================================================

CREATE TABLE legislation_commits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Git-style identifiers
    commit_hash VARCHAR(64) NOT NULL UNIQUE,
    parent_hash VARCHAR(64),
    merge_parent_hash VARCHAR(64),

    -- Bill reference
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,

    -- Author (who wrote the change)
    author_id UUID NOT NULL REFERENCES persons(id),
    author_name VARCHAR(255) NOT NULL,
    author_public_key TEXT NOT NULL,
    author_role VARCHAR(100) NOT NULL,
    author_region_id UUID REFERENCES regions(id),

    -- Committer (who approved/merged the change — may differ from author)
    committer_id UUID NOT NULL REFERENCES persons(id),
    committer_name VARCHAR(255) NOT NULL,
    committer_public_key TEXT NOT NULL,
    committer_role VARCHAR(100) NOT NULL,

    -- Change details
    change_type legislation_change_type NOT NULL,
    message TEXT NOT NULL,
    snapshot TEXT NOT NULL,  -- Full text of the bill at this commit

    -- Cryptographic verification
    signature TEXT NOT NULL,

    -- Timestamps
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- References (amendment, vote session, etc.)
    references JSONB DEFAULT '[]'::jsonb,

    -- Tags (e.g., "initial-draft", "committee-approved")
    tags TEXT[] DEFAULT '{}',

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Self-referential foreign keys
    FOREIGN KEY (parent_hash) REFERENCES legislation_commits(commit_hash),
    FOREIGN KEY (merge_parent_hash) REFERENCES legislation_commits(commit_hash)
);

-- ============================================================================
-- LEGISLATION DIFF HUNKS TABLE
-- Stores the actual line-by-line changes for each commit.
-- ============================================================================

CREATE TABLE legislation_diff_hunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    commit_id UUID NOT NULL REFERENCES legislation_commits(id) ON DELETE CASCADE,

    -- Hunk position
    old_start INTEGER NOT NULL,
    old_lines INTEGER NOT NULL,
    new_start INTEGER NOT NULL,
    new_lines INTEGER NOT NULL,

    -- Ordering within the commit
    hunk_order INTEGER NOT NULL DEFAULT 0,

    UNIQUE (commit_id, hunk_order)
);

-- ============================================================================
-- LEGISLATION DIFF LINES TABLE
-- Individual line changes within a hunk.
-- ============================================================================

CREATE TABLE legislation_diff_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hunk_id UUID NOT NULL REFERENCES legislation_diff_hunks(id) ON DELETE CASCADE,

    -- Line change details
    change_type VARCHAR(10) NOT NULL CHECK (change_type IN ('add', 'delete', 'context')),
    content TEXT NOT NULL,
    old_line_number INTEGER,
    new_line_number INTEGER,

    -- Ordering within the hunk
    line_order INTEGER NOT NULL DEFAULT 0,

    UNIQUE (hunk_id, line_order)
);

-- ============================================================================
-- LEGISLATION BLAME TABLE
-- Pre-computed blame cache — line-by-line attribution for the latest version.
-- Rebuilt whenever a new commit is added.
-- ============================================================================

CREATE TABLE legislation_blame (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    commit_hash VARCHAR(64) NOT NULL REFERENCES legislation_commits(commit_hash),

    -- Line-level attribution
    line_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES persons(id),
    author_name VARCHAR(255) NOT NULL,
    author_role VARCHAR(100) NOT NULL,

    -- Traceability
    blame_commit_hash VARCHAR(64) NOT NULL REFERENCES legislation_commits(commit_hash),
    change_type legislation_change_type NOT NULL,
    commit_message TEXT NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL,

    -- History
    revision_count INTEGER NOT NULL DEFAULT 1,
    original_line_number INTEGER NOT NULL,
    origin_commit_hash VARCHAR(64) NOT NULL REFERENCES legislation_commits(commit_hash),

    UNIQUE (bill_id, commit_hash, line_number)
);

-- ============================================================================
-- LEGISLATION BRANCHES TABLE
-- Named branches for bills (main, amendment forks, etc.)
-- ============================================================================

CREATE TABLE legislation_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    head_hash VARCHAR(64) NOT NULL REFERENCES legislation_commits(commit_hash),
    is_main BOOLEAN NOT NULL DEFAULT FALSE,

    -- Creator
    created_by UUID NOT NULL REFERENCES persons(id),
    description TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (bill_id, name)
);

-- ============================================================================
-- LEGISLATION TAGS TABLE
-- Named points in history (e.g., "v1.0-ratified", "committee-approved")
-- ============================================================================

CREATE TABLE legislation_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    commit_hash VARCHAR(64) NOT NULL REFERENCES legislation_commits(commit_hash),

    name VARCHAR(255) NOT NULL,
    message TEXT,
    tagger_id UUID NOT NULL REFERENCES persons(id),
    tagger_name VARCHAR(255) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (commit_hash, name)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Fast lookup of commits by bill
CREATE INDEX idx_legislation_commits_bill_id ON legislation_commits(bill_id);
CREATE INDEX idx_legislation_commits_committed_at ON legislation_commits(committed_at DESC);
CREATE INDEX idx_legislation_commits_author_id ON legislation_commits(author_id);
CREATE INDEX idx_legislation_commits_change_type ON legislation_commits(change_type);
CREATE INDEX idx_legislation_commits_parent_hash ON legislation_commits(parent_hash);

-- Fast blame lookups
CREATE INDEX idx_legislation_blame_bill_id ON legislation_blame(bill_id);
CREATE INDEX idx_legislation_blame_author_id ON legislation_blame(author_id);
CREATE INDEX idx_legislation_blame_bill_commit ON legislation_blame(bill_id, commit_hash);

-- Fast branch lookups
CREATE INDEX idx_legislation_branches_bill_id ON legislation_branches(bill_id);

-- Fast diff lookups
CREATE INDEX idx_legislation_diff_hunks_commit_id ON legislation_diff_hunks(commit_id);
CREATE INDEX idx_legislation_diff_lines_hunk_id ON legislation_diff_lines(hunk_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_legislation_branches_updated_at
    BEFORE UPDATE ON legislation_branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEW: Legislation commit log (human-readable)
-- ============================================================================

CREATE OR REPLACE VIEW legislation_commit_log AS
SELECT
    lc.commit_hash,
    lc.parent_hash,
    b.title AS bill_title,
    lc.author_name,
    lc.author_role,
    lc.change_type,
    lc.message,
    lc.committed_at,
    lc.tags,
    LENGTH(lc.snapshot) AS snapshot_length,
    (SELECT COUNT(*) FROM legislation_diff_hunks h WHERE h.commit_id = lc.id) AS hunk_count
FROM legislation_commits lc
JOIN bills b ON b.id = lc.bill_id
ORDER BY lc.committed_at DESC;

-- ============================================================================
-- VIEW: Blame summary per bill (who contributed what percentage)
-- ============================================================================

CREATE OR REPLACE VIEW legislation_blame_summary AS
SELECT
    lb.bill_id,
    b.title AS bill_title,
    lb.author_id,
    lb.author_name,
    lb.author_role,
    COUNT(*) AS lines_authored,
    ROUND(COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY lb.bill_id), 0) * 100, 1) AS contribution_percentage,
    MIN(lb.committed_at) AS first_contribution,
    MAX(lb.committed_at) AS last_contribution,
    ARRAY_AGG(DISTINCT lb.change_type) AS change_types
FROM legislation_blame lb
JOIN bills b ON b.id = lb.bill_id
GROUP BY lb.bill_id, b.title, lb.author_id, lb.author_name, lb.author_role
ORDER BY lines_authored DESC;
