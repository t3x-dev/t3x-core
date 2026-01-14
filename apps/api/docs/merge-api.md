# Merge API Documentation

## Overview

The T3X Merge API provides two-way merge capabilities for semantic commits. Unlike traditional three-way merges that require a common ancestor, our two-way merge directly compares source and target commits using advanced semantic similarity algorithms.

## Endpoints

### POST /api/v1/merge/prepare

Analyzes two commits and returns a merge preparation result that the user must resolve.

**Request:**
```json
{
  "source_hash": "sha256:abc123...",
  "target_hash": "sha256:def456..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "identical": [
      {
        "id": "s1",
        "text": "Use React framework",
        "confidence": 1,
        "source": {
          "type": "turn",
          "id": "turn_s1"
        }
      }
    ],
    "similarPairs": [
      {
        "source": {
          "id": "s2",
          "text": "Budget is $3000",
          "confidence": 1,
          "source": { "type": "turn", "id": "turn_s2" }
        },
        "target": {
          "id": "t2",
          "text": "Budget is $5000",
          "confidence": 1,
          "source": { "type": "turn", "id": "turn_t2" }
        },
        "wordDiff": [
          { "type": "common", "value": "Budget is" },
          { "type": "removed", "value": "$3000" },
          { "type": "added", "value": "$5000" }
        ],
        "resolution": null,
        "sourceConstraints": [],
        "targetConstraints": []
      }
    ],
    "onlyInSource": [
      {
        "sentence": {
          "id": "s3",
          "text": "Deploy on AWS",
          "confidence": 1,
          "source": { "type": "turn", "id": "turn_s3" }
        },
        "constraints": [],
        "keep": true
      }
    ],
    "onlyInTarget": []
  }
}
```

**Error Responses:**
- `404 NOT_FOUND` - Source or target commit not found
- `500 INTERNAL_ERROR` - Server error

---

### POST /api/v1/merge/execute

Executes a merge after the user has resolved all conflicts.

**Request:**
```json
{
  "source_hash": "sha256:abc123...",
  "target_hash": "sha256:def456...",
  "prepared": {
    "identical": [...],
    "similarPairs": [
      {
        "source": {...},
        "target": {...},
        "wordDiff": [...],
        "resolution": "source",  // ← User must set this!
        "sourceConstraints": [],
        "targetConstraints": []
      }
    ],
    "onlyInSource": [
      {
        "sentence": {...},
        "constraints": [],
        "keep": true  // ← User must set this!
      }
    ],
    "onlyInTarget": []
  },
  "message": "Merge feature-branch into main",
  "branch": "main"  // optional
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "hash": "sha256:merge789...",
    "schema": "commit/v3",
    "parents": ["sha256:abc123...", "sha256:def456..."],
    "author": {
      "name": "Alice",
      "identity": "alice@example.com",
      "verification": "verified"
    },
    "committed_at": "2024-01-15T10:30:00.000Z",
    "content": {
      "sentences": [
        { "id": "m1", "text": "Use React framework", ... },
        { "id": "m2", "text": "Budget is $3000", ... },
        { "id": "m3", "text": "Deploy on AWS", ... }
      ],
      "constraints": []
    },
    "message": "Merge feature-branch into main",
    "branch": "main"
  }
}
```

**Error Responses:**
- `400 UNRESOLVED_PAIRS` - Some similarPairs have no resolution
- `500 MERGE_FAILED` - Merge execution failed

---

## Authentication

The API supports optional authentication via headers:

```
X-User-Name: Alice
X-User-Email: alice@example.com
```

If these headers are provided, the merge commit will use a **verified** author. Otherwise, it uses a **local** author with verification status 'none'.

---

## Workflow Example

```javascript
// Step 1: Prepare merge
const prepareResponse = await fetch('http://localhost:8000/api/v1/merge/prepare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source_hash: 'sha256:abc123...',
    target_hash: 'sha256:def456...'
  })
});

const { data: prepared } = await prepareResponse.json();

// Step 2: User resolves conflicts (UI interaction)
prepared.similarPairs.forEach(pair => {
  pair.resolution = userChoosesSourceOrTarget(pair); // 'source' or 'target'
});

prepared.onlyInSource.forEach(candidate => {
  candidate.keep = userDecidesToKeep(candidate); // true or false
});

prepared.onlyInTarget.forEach(candidate => {
  candidate.keep = userDecidesToKeep(candidate); // true or false
});

// Step 3: Execute merge
const executeResponse = await fetch('http://localhost:8000/api/v1/merge/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Name': 'Alice',
    'X-User-Email': 'alice@example.com'
  },
  body: JSON.stringify({
    source_hash: 'sha256:abc123...',
    target_hash: 'sha256:def456...',
    prepared,
    message: 'Merge feature-branch into main',
    branch: 'main'
  })
});

const { data: mergeCommit } = await executeResponse.json();
console.log('Merge commit created:', mergeCommit.hash);
```

---

## OpenAPI Specification

The full OpenAPI 3.1 specification is available at:

**JSON Spec:** http://localhost:8000/api/openapi.json

**Interactive UI:** http://localhost:8000/api/docs

The interactive Scalar UI provides:
- Full schema definitions
- Try-it-out functionality
- Request/response examples
- Type information

---

## Implementation Details

### Merge Algorithm

The two-way merge uses:
1. **Exact matching** for identical sentences (text comparison)
2. **Jaccard similarity + LCS** for similar sentences (word-level diff)
3. **Hungarian algorithm** for optimal pairing of similar sentences

### ID Generation

Merge commits generate new IDs:
- Sentences: `m1`, `m2`, `m3`, ...
- Constraints: `mc1`, `mc2`, `mc3`, ...

This prevents ID conflicts between source and target commits.

### Hash Computation

Merge commit hashes use SHA-256 on canonicalized JSON (JCS) of:
- `schema`: 'commit/v3'
- `parents`: [source_hash, target_hash]
- `author`: author object
- `committed_at`: ISO 8601 timestamp
- `content`: normalized sentences and constraints

---

## Error Handling

All endpoints return a consistent error structure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

Common error codes:
- `NOT_FOUND` - Commit not found
- `UNRESOLVED_PAIRS` - Missing conflict resolutions
- `MERGE_FAILED` - Merge execution error
- `INTERNAL_ERROR` - Server error
