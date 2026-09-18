# Unified Portfolio

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People reviewing their own investments across Zerodha, Angel One and INDmoney, each in an isolated Google-authenticated workspace.

## Product Purpose

Unified Portfolio helps each user understand holdings, allocation, historical value and connection health through a canonical, read-only backend shared by the web dashboard and MCP.

## Capabilities and Constraints

Source: owner PRD in issue #1. Exactly five screens. Official broker login. No manual holdings imports in normal use. No trades, transfers or SIP changes. Never disguise stale or incomplete data. Store daily history. Broker credentials stay at the broker.

## Evidence on Hand

No live broker accounts connected. Sample data is prohibited in the app and MCP. Cloudflare Workers and D1 are provisioned; Google OAuth registration and live broker validation remain pending.

## Product Principles

Resilient connections; honest valuations; account provenance; read-only access; minimal infrastructure.
