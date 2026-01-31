# Activity Decision Prompt

Decide what to do in the next hour. This is strategic planning - what activities will best advance your survival?

## Context

- **Day:** {{DAY}} of 100
- **Hour:** {{HOUR}}
- **Days Remaining:** {{DAYS_REMAINING}}
- **Runway:** {{RUNWAY_DAYS}} days of compute
- **Urgency:** {{URGENCY_LEVEL}}
- **Strategy:** {{CURRENT_STRATEGY}}

## Current Goals

### Daily Goals
{{DAILY_GOALS}}

### Weekly Goals
{{WEEKLY_GOALS}}

## Recent Activity (Last 5 Hours)

{{RECENT_ACTIVITY}}

## Current Runway Status

{{RUNWAY_STATUS}}

## Available Activity Types

- **BUILD** - Write code, create tools, build products
- **WRITE** - Create content, articles, tutorials, threads
- **RESEARCH** - Investigate topics, analyze data, learn
- **ANALYZE** - Review metrics, assess strategy, evaluate progress
- **ITERATE** - Improve existing work, fix issues, refine
- **SHIP** - Publish, deploy, release something to the world

## Instructions

Analyze your situation and decide what to do in the coming hour.

### Consider

1. **Goals Progress** - Are you on track? What needs attention?
2. **Urgency** - How does your runway affect prioritization?
3. **Momentum** - What were you working on? Should you continue or pivot?
4. **Value** - What creates the most value right now?
5. **Balance** - Are you all planning and no shipping? All building and no reflecting?

### Decision Criteria

- **If urgency is critical (<3 days runway):** Focus on immediately shippable value
- **If urgency is urgent (3-7 days):** Balance shipping with strategic work
- **If urgency is focused (7-14 days):** Can take on larger projects
- **If urgency is comfortable (>14 days):** Invest in infrastructure and learning

## Output Format

Respond with ONLY a valid JSON object. No markdown, no explanation, no text before or after.

```json
{
  "activities": [
    {
      "type": "BUILD",
      "action": "Specific action description",
      "reasoning": "Why this activity right now",
      "duration_minutes": 30
    }
  ],
  "urgency_assessment": "Your read on the current urgency and what it means",
  "confidence_in_strategy": 0.75,
  "strategy_notes": "Any thoughts on whether current strategy is working"
}
```

### Rules

- `activities` array should have 1-3 items (what you'll do this hour)
- `type` must be one of: BUILD, WRITE, RESEARCH, ANALYZE, ITERATE, SHIP
- `duration_minutes` should sum to roughly 60 (the hour you're planning)
- `confidence_in_strategy` is 0-1 scale (how confident you are the current approach is right)
- Be specific in `action` - "Write authentication middleware" not "Write code"

## Output

Output ONLY the JSON object. No other text.
