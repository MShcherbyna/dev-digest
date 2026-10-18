Body (SKILL.md)

# response-schema — response shape changes

`client/` and `reviewer-core/` parse server responses with shared Zod schemas.
A changed type or changed optionality of a response field breaks those consumers.

## Severity

Any change to API request parameters or response shape (type, field name, required/optional, structure, enum) 
is CRITICAL unless all affected clients are updated in the same change.

## Finding format

```
CRITICAL [response-schema] <file>:<line>
Change: <what changed>
Consumers: <files>
Fix: <additive alternative>
```
