# CDMP MVP - Claude Code Instructions

## Frontend Development

- Always reference UI prototype HTML files in `/prototypes` directory before implementing any frontend feature. Match layout, styling, and component structure exactly to the prototype.
- After adding any new page/feature, always verify and update the sidebar navigation across ALL pages to include the new route.

## TDD Workflow

- When implementing features with TDD workflow, always include frontend prototype page implementation as a required phase, never mark it as optional.

## Backend / Database

- When debugging database/backend issues, avoid assuming the first fix is complete. Check for: composite primary keys, hardcoded column names (e.g., 'id'), NULL handling, and FK constraint ordering in test cleanup.

## ETL / Data Processing

- For ETL/data processing features, always design for production-scale data volumes. Never use in-memory strategies for datasets that could exceed available RAM. Default to streaming/batch approaches.

## Agent Workflow

- When working with multi-agent workflows, each agent role must stay within its responsibilities. Product-analyst writes stories, spec-writer writes specs, system-architect updates architecture docs. Do not cross boundaries.
