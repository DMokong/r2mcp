---
type: Module
title: src/breadcrumbs.ts
description: Skeleton concept for src/breadcrumbs.ts (extracted; 24 symbols).
resource: src/breadcrumbs.ts
tags:
  - src
  - module
  - class
  - function
  - interface
  - method
  - type
enrichment: none
from: []
explains: []
stale: false
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
---

# Structure

## Exports
- `Breadcrumb` (interface, lines 25-29)
- `BreadcrumbContext` (type, lines 38-54)
- `ExtractEntitiesArgs` (interface, lines 138-141)
- `ExtractEntitiesResponse` (interface, lines 131-136)
- `ExtractedEntitySummary` (interface, lines 125-129)
- `InvalidBreadcrumbError` (class, lines 143-150)
- `LintArgs` (interface, lines 106-108)
- `LintFinding` (interface, lines 94-99)
- `LintResponse` (interface, lines 101-104)
- `RecallArgs` (interface, lines 89-92)
- `RecallResponse` (interface, lines 81-87)
- `RecallResultItem` (interface, lines 65-68)
- `RecallSignal` (interface, lines 75-79)
- `RememberArgs` (interface, lines 120-123)
- `RememberResponse` (interface, lines 114-118)
- `ToolName` (type, lines 9-20)
- `assertBreadcrumb` (function, lines 152-163)
- `withBreadcrumbs` (function, lines 269-278)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `Breadcrumb` | interface | 25-29 | yes |
| `BreadcrumbContext` | type | 38-54 | yes |
| `ExtractEntitiesArgs` | interface | 138-141 | yes |
| `ExtractEntitiesResponse` | interface | 131-136 | yes |
| `ExtractedEntitySummary` | interface | 125-129 | yes |
| `InvalidBreadcrumbError` | class | 143-150 | yes |
| `InvalidBreadcrumbError.constructor` | method | 144-149 | yes |
| `LintArgs` | interface | 106-108 | yes |
| `LintFinding` | interface | 94-99 | yes |
| `LintResponse` | interface | 101-104 | yes |
| `RecallArgs` | interface | 89-92 | yes |
| `RecallResponse` | interface | 81-87 | yes |
| `RecallResultItem` | interface | 65-68 | yes |
| `RecallSignal` | interface | 75-79 | yes |
| `RememberArgs` | interface | 120-123 | yes |
| `RememberResponse` | interface | 114-118 | yes |
| `ToolName` | type | 9-20 | yes |
| `assertBreadcrumb` | function | 152-163 | yes |
| `dispatchMapper` | function | 253-267 | no |
| `mapExtractEntities` | function | 228-251 | no |
| `mapLint` | function | 187-204 | no |
| `mapRecall` | function | 168-186 | no |
| `mapRemember` | function | 207-227 | no |
| `withBreadcrumbs` | function | 269-278 | yes |

## Calls out
- `dispatchMapper` → `mapExtractEntities` (same file)
- `dispatchMapper` → `mapLint` (same file)
- `dispatchMapper` → `mapRecall` (same file)
- `dispatchMapper` → `mapRemember` (same file)
- `withBreadcrumbs` → `assertBreadcrumb` (same file)
- `withBreadcrumbs` → `dispatchMapper` (same file)

## Called by
- `asMcpResponse` in [src/mcp-response.ts](/src/mcp-response.md)
