# MCP Registry (Low Level Design)

## Overview
Manages Model Context Protocol (MCP) providers and capabilities. Abstract all external services.

## Responsibilities
- Register providers
- Map capabilities
- Resolve tools dynamically
- Enforce tenant restrictions

## Categories
- LLM
- Vision
- Speech
- OCR
- Embeddings
- Storage
- Sandbox
- Media
- Downloads

## Provider Management
- Provider discovery
- Capability scoping
- Version control
- Swapping providers (open-source ↔ paid)
