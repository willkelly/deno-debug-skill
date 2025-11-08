# SKILL.md Improvements

## Problems Identified

When packaged and used, Claude was:
1. Writing its own CDP client scripts instead of using provided ones
2. Not recognizing the skill properly

## Root Causes

### 1. Missing YAML Frontmatter
**Issue**: SKILL.md had no frontmatter, which is required for Claude to recognize it as a skill.

**Fix**: Added proper YAML header:
```yaml
---
name: deno-debugger
description: Debug Deno/TypeScript applications using V8 Inspector Protocol...
---
```

### 2. Abstract/Fragmented Examples
**Issue**: Examples showed snippets like:
```python
# Connection
client = CDPClient('127.0.0.1', 9229)
client.enable_debugger()
```

This encouraged Claude to write inline scripts rather than use the full infrastructure.

**Fix**: Replaced with complete, copy-pasteable examples:
```python
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path('./scripts')))

from cdp_client import CDPClient
from breadcrumbs import Breadcrumbs

async def investigate():
    bc = Breadcrumbs()
    client = CDPClient('127.0.0.1', 9229)
    await client.connect()
    # ... full investigation workflow ...
```

### 3. Weak Warnings
**Issue**: The instruction to "use the tools" was buried and not emphatic.

**Fix**: Added prominent section at top:
```markdown
## ⚠️ CRITICAL: Use Pre-written Scripts

**DO NOT write your own CDP client, heap analyzer, or profiler code.**

All infrastructure is already implemented in `./scripts/`:
...
```

### 4. No Clear Workflow
**Issue**: SKILL.md read like reference documentation, not step-by-step instructions.

**Fix**: Restructured following the session-start-hook pattern:
```markdown
## Workflow

Make a todo list for all tasks in this workflow...

### 1. Setup and Connect
### 2. Form Hypothesis
### 3. Choose Investigation Pattern
...
```

### 5. Missing Pattern Templates
**Issue**: No concrete examples for common investigation types.

**Fix**: Added three complete patterns:
- Pattern A: Memory Leak (with full heap snapshot workflow)
- Pattern B: Performance Bottleneck (with CPU profiling)
- Pattern C: Race Condition (with breakpoints and async debugging)

### 6. No "Common Mistakes" Section
**Issue**: Nothing explicitly saying what NOT to do.

**Fix**: Added section:
```markdown
## Common Mistakes to Avoid

❌ **DON'T** write a new CDP WebSocket client
❌ **DON'T** parse heap snapshots manually
...

✅ **DO** use CDPClient from cdp_client.py
✅ **DO** use HeapSnapshot from heap_analyzer.py
...
```

## Comparison

### Before
- 281 lines
- Abstract API descriptions
- Fragmented code snippets
- No YAML frontmatter
- Reference-style documentation

### After
- 434 lines (+54%)
- Complete working examples
- Copy-pasteable code blocks
- YAML frontmatter ✅
- Step-by-step workflow
- Explicit DO/DON'T sections
- Three complete investigation patterns

## Testing Recommendations

To verify the improvements work:

1. **Install the skill** in a fresh Claude Code environment
2. **Start a buggy Deno app** (use examples/scenarios/)
3. **Ask Claude to investigate** using the exact prompts from scenarios
4. **Verify Claude**:
   - Imports from scripts/ directory
   - Uses CDPClient, not a custom WebSocket client
   - Uses HeapSnapshot, not manual JSON parsing
   - Uses Breadcrumbs throughout
   - Follows the workflow structure

## Key Changes in Code Style

### Old Style (Abstract)
```python
# Profiling
from scripts.cpu_profiler import start_profiling, stop_profiling
start_profiling(client)
# ... let code run ...
profile = stop_profiling(client)
```

### New Style (Complete)
```python
from cpu_profiler import CPUProfile

# 1. Start profiling
bc.add_test('cpu_profiling', 'Profiling slow operation')
await client.start_profiling()

# 2. Trigger slow operation
await asyncio.sleep(2)

# 3. Stop and analyze
profile_data = await client.stop_profiling()
profile = CPUProfile(profile_data)

# 4. Find hot functions
hot_functions = profile.get_hot_functions()
for func in hot_functions[:5]:
    print(f"{func['function_name']}: {func['self_time_percent']:.1f}%")
```

The new style shows the complete flow, making it obvious to use the existing infrastructure.

## Additional Improvements (Latest Update)

### 7. Output Format Refinement

**Issue**: SKILL.md referenced Org mode output format, which is less universal than Markdown.

**Fix**:
- Changed Step 6 to generate `REPORT.md` (Markdown) instead of `investigation.org`
- Updated complete example to use Markdown report generation
- Made Org mode output optional via `org_report.py` script

### 8. Breadcrumb Usage Clarification

**Issue**: Previous version implied breadcrumbs should be used for every action, which creates verbose, low-value tracking.

**Fix**: Added "Breadcrumb Usage Guidelines" section:
```markdown
## Breadcrumb Usage Guidelines

**Use breadcrumbs to track your investigation state, NOT as a log of every action.**

Use breadcrumbs for:
- ✅ Initial hypothesis about the problem
- ✅ Major decision points
- ✅ Key findings that change your understanding
- ✅ Final conclusion

Do NOT use breadcrumbs for:
- ❌ Every file read or code inspection
- ❌ Routine actions like "connecting to inspector"
- ❌ Small intermediate steps
```

**Changes throughout document**:
- Made breadcrumb tracking optional in Steps 2 and 5
- Removed `bc.add_test()` calls from investigation patterns
- Added print statements for progress feedback
- Updated API reference to emphasize "Optional" for breadcrumbs
- Fixed inconsistencies in Key Principles and Common Mistakes sections

### 9. Conversational Output Format

**Issue**: Step 7 was too formal and template-driven.

**Fix**: Rewrote Step 7 "Present Findings" with conversational example:
```
I found the memory leak! 🎯

The issue is in `upload_handler.ts` at line 42...

Fix:
Add this cleanup after processing:
  pendingUploads.length = 0;
```

**Guidelines added**:
- Be conversational and clear
- Lead with the root cause
- Explain WHY it's happening, not just WHAT
- Provide a specific, actionable fix

### 10. Report Quality Improvements

**Issue**: Template-driven reports were repetitive and vague. Each section restated the same information without adding depth.

**Fix**: Added content quality guidance to Step 6:

**Key principles:**
1. Each section answers a DIFFERENT question:
   - Summary: "What's broken?"
   - Root Cause: "WHY is it broken?" (mechanism)
   - Details: "What ELSE did you learn?" (evidence, code, impact)
   - Fix: "What's the solution and WHY does it work?"

2. Show your work:
   - Include code snippets (not just line numbers)
   - Explain anti-patterns
   - Be specific: "~47KB/upload = OOM after 22,543 uploads" not "grows over time"
   - Calculate production impact

3. Fix section should be confident:
   - Show THE best solution with reasoning
   - Only show alternatives if they have legitimate trade-offs
   - Don't present "Option 1 (RECOMMENDED)" vs "Option 2 (NOT RECOMMENDED)"

**Result**: Reports now provide:
- Code context (showing lines 12-24 with annotations)
- Named anti-patterns ("retain-and-forget")
- Production impact calculations ("225 hours to OOM")
- Confident, reasoned recommendations
- Each section adds NEW information

## Files Changed

- `skill/SKILL.md` - Complete rewrite (385 insertions, 233 deletions)
- `skill/SKILL.md` - Output format improvements (+225, -110)
- `skill/SKILL.md` - Report quality guidance (+100, -23)
- `skill/SKILL.md` - Fix section simplification (+19, -17)

## Impact

This should prevent Claude from:
- Writing custom CDP WebSocket clients
- Parsing heap snapshots manually
- Recreating infrastructure that already exists
- Using breadcrumbs excessively for routine actions
- Generating repetitive, template-driven reports
- Showing inferior alternatives as "options"

And encourage Claude to:
- Follow the numbered workflow
- Use complete examples as templates
- Track investigation milestones with breadcrumbs (sparingly)
- Save artifacts in Markdown format
- Present findings conversationally
- Generate high-quality, evidence-based reports with specific impact analysis
- Provide confident, reasoned recommendations
