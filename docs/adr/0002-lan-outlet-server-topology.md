# 0002. LAN Outlet-Server Topology

## Status
Accepted

## Context
Restaurant dine-in operations — placing orders, printing KOTs to the kitchen, billing — must keep working even when the outlet's internet connection is down. A cloud-only architecture makes every order-taking and billing action depend on internet reachability, which is unacceptable: a kitchen cannot wait on a WAN link to print a ticket, and a cashier cannot be blocked from closing a bill because the outlet's ISP is having a bad day.

This is not a hypothetical requirement. Evidence review of 86 screenshots from the reference KapMeta application directly confirms this topology already exists in the product we are cloning: a "Machines" configuration panel displays a distinct **Main Server IP** and one or more **Client Machine IP** entries on the outlet's local network, and the System Config screen exposes admin tiles for "Reset Sync Code," "Database Migration," and "Remove Backup Files" — all of which only make sense if a local, outlet-resident server process owns a local database and is the thing being synced, migrated, and backed up.

Aggregator orders (Swiggy, Zomato, etc.) are a separate case: aggregators are cloud services and physically cannot reach into an outlet's LAN, so those orders must land in the cloud first and then reach the outlet via sync.

## Decision
Each physical outlet runs a local **outlet-server** process on the outlet's LAN. The outlet-server:
- Owns a local database (Postgres or an embedded equivalent) that is the source of truth for that outlet's live operations: orders, tables, KOTs, bills, local menu/price state, and local settings.
- Is the only thing POS client terminals ("Client Machines") on that LAN talk to for core dine-in flows. Clients never call the cloud directly for order-taking, KOT printing, or billing.
- Periodically syncs with the cloud backend using the outbox/inbox pattern (see ADR-0003), pushing local activity up and pulling cloud-originated changes (aggregator orders, centrally managed settings/menu edits) down.
- Continues to serve all core dine-in operations — including kitchen printing — with zero degradation when the internet or the cloud backend is unreachable. Only cross-outlet reporting, remote admin actions, and aggregator order ingestion require cloud connectivity, and those are non-blocking to local operations.

The cloud backend's responsibilities are: receiving aggregator webhooks, providing cross-outlet reporting (schema-ready per ADR-0005, out of v1 UI scope), remote/central admin, and acting as the sync hub between outlets. The cloud is never a hard dependency for core dine-in order-taking, billing, or printing.

## Consequences

**Positive**
- Matches confirmed real-world reference-app behavior, reducing risk of building an architecture the product category has already proven wrong.
- Kitchen printing, order-taking, and billing are fully functional during internet outages — the actual operational requirement.
- LAN latency between client terminals and the outlet-server is far lower and more predictable than a WAN round trip to the cloud, improving UX for busy floor operations.
- Clear ownership boundary: outlet-server owns live operational data; cloud owns cross-outlet aggregation and aggregator ingestion. This maps cleanly onto ADR-0003's sync design.

**Negative**
- We now operate and support a distributed piece of software per outlet, not just a single cloud service: outlet-server installation, updates, local database backup, and local hardware failure all become real support burdens (mirrored by the reference app's own "Database Migration" / "Remove Backup Files" tooling, which we should expect to need equivalents of).
- Local hardware becomes a single point of failure per outlet (if the machine hosting the outlet-server dies mid-service, that outlet is down until it's replaced or a client can be promoted) — this needs an explicit recovery story, tracked separately.
- Two runtime environments (outlet-server, cloud backend) must both be kept compatible with the same modular monolith codebase (ADR-0001) or a clearly split subset of it, adding deployment/versioning complexity.
- Local-first requires we design every core write path to work with zero cloud round trips, which constrains how features like promotions, loyalty, or centrally pushed price changes can be implemented (they must tolerate delayed sync).

## Alternatives Considered

**Pure cloud SaaS with no local server** — every POS terminal talks directly to a cloud API. Rejected: this breaks kitchen operations the moment internet connectivity drops, which is not acceptable for a restaurant's core workflow, and it directly contradicts the confirmed reference-app evidence (Machines panel, Main Server IP, Reset Sync Code) — the product we are cloning has already validated the LAN-server model in the field.

**Thick offline-capable client with no separate local server process** — each POS terminal runs its own embedded database and terminals reconcile with each other and the cloud via app-level, client-to-client conflict resolution. Rejected: this does not explain the observed UI, which shows a distinct "Main Server" role separate from multiple "Client Machine" entries. A peer-to-peer or client-owns-its-own-database model would not need a single named server IP that all clients point at. A dedicated local server process, with clients as thin(ner) consumers of it, is the simpler explanation consistent with the evidence, and it centralizes conflict handling in one place (the outlet-server) rather than spreading it across every terminal.
