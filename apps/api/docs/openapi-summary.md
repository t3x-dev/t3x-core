# OpenAPI Documentation Summary

## Merge API OpenAPI Implementation

The T3X Merge API has been fully documented using OpenAPI 3.1 specification.

### Files Created

1. **`src/schemas/merge.ts`** - Zod schemas with OpenAPI annotations
   - Base schemas: `SentenceSchema`, `ConstraintSchema`, `WordDiffSchema`
   - Request schemas: `PrepareMergeRequestSchema`, `ExecuteMergeRequestSchema`
   - Response schemas: `PrepareMergeResponseSchema`, `ExecuteMergeResponseSchema`
   - Full type definitions for all merge-related data structures

2. **`src/routes/merge.openapi.ts`** - OpenAPI-enabled merge routes
   - `POST /v1/merge/prepare` - Two-way merge preparation
   - `POST /v1/merge/execute` - Merge execution with user resolutions
   - `POST /v1/merge/drafts` - Create merge draft (NEW)
   - `GET /v1/merge/drafts/:id` - Get merge draft (NEW)
   - `PATCH /v1/merge/drafts/:id` - Update merge draft decisions (NEW)
   - `POST /v1/merge/drafts/:id/commit` - Commit merge draft (NEW)
   - `DELETE /v1/merge/drafts/:id` - Delete merge draft (NEW)
   - Complete request/response documentation
   - Detailed descriptions and examples

3. **`docs/merge-api.md`** - User-facing API documentation
   - Endpoint descriptions
   - Request/response examples
   - Workflow examples
   - Implementation details

### Accessing OpenAPI Documentation

#### 1. JSON Specification
```
http://localhost:8000/api/openapi.json
```

Returns the complete OpenAPI 3.1 specification in JSON format.

#### 2. Interactive UI (Scalar)
```
http://localhost:8000/api/docs
```

Provides an interactive API reference with:
- Searchable endpoint list
- Try-it-out functionality
- Request/response examples
- Schema definitions
- Type information

### OpenAPI Features

#### Tags
The merge endpoints are tagged with `"Merge"` for easy filtering in the documentation UI.

#### Descriptions
Both endpoints include detailed descriptions explaining:
- What the endpoint does
- Requirements for parameters
- Expected responses
- Error scenarios

#### Schema Validation
All request and response schemas are validated using Zod with OpenAPI annotations:
- Type constraints (string, number, boolean, etc.)
- Value constraints (min, max, minLength, enum)
- Required vs optional fields
- Default values
- Examples

#### Error Responses
Consistent error response format documented for all endpoints:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

### Example OpenAPI Schema Output

For `/v1/merge/prepare`, the OpenAPI spec includes:

```json
{
  "tags": ["Merge"],
  "summary": "Prepare a two-way merge",
  "description": "Analyzes two commits and returns a merge preparation result...",
  "requestBody": {
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "properties": {
            "source_hash": {
              "type": "string",
              "minLength": 1,
              "description": "Source commit hash (sha256:...)",
              "example": "sha256:abc123..."
            },
            "target_hash": {
              "type": "string",
              "minLength": 1,
              "description": "Target commit hash (sha256:...)",
              "example": "sha256:def456..."
            }
          },
          "required": ["source_hash", "target_hash"]
        }
      }
    }
  },
  "responses": {
    "200": { ... },
    "404": { ... },
    "500": { ... }
  }
}
```

### Integration with Existing Routes

The merge routes follow the same OpenAPI pattern as other routes (e.g., projects):
- Uses `@hono/zod-openapi` for route definitions
- Uses `createRoute()` to define OpenAPI metadata
- Uses `.openapi()` method to register routes
- Reuses common schemas from `schemas/common.ts`

### Verification

✅ **Build**: Successfully compiled with all OpenAPI routes
✅ **Tests**: All merge API tests passing
✅ **OpenAPI JSON**: Accessible at `/api/openapi.json`
✅ **Merge Prepare**: `/v1/merge/prepare` documented
✅ **Merge Execute**: `/v1/merge/execute` documented
✅ **Merge Drafts**: `/v1/merge/drafts/*` documented (NEW)

### Developer Usage

To generate API clients from the OpenAPI spec:

```bash
# Download the spec
curl http://localhost:8000/api/openapi.json > openapi.json

# Generate TypeScript client
npx openapi-typescript openapi.json -o api-types.ts

# Generate client for other languages
npx @openapitools/openapi-generator-cli generate \
  -i openapi.json \
  -g python \
  -o ./python-client
```

### Next Steps (Optional)

1. Add more examples to the OpenAPI annotations
2. Add security schemes (API keys, OAuth) if needed
3. Add rate limiting documentation
4. Add webhook documentation for async operations
5. Generate client SDKs from the OpenAPI spec

## Conclusion

The Merge API is now fully documented with OpenAPI 3.1, providing:
- Machine-readable API specification
- Interactive documentation UI
- Automatic client SDK generation capabilities
- Type-safe request/response validation
- Comprehensive error handling documentation
