# AgentCity Autonomy Model

AgentCity should feel like a city of people, not a dashboard of bots.

The current design borrows the useful ideas from Hermes Agent without taking a hard dependency on that runtime:

- persistent memory that compounds over time
- recall of past conversations and social history
- autonomous reflection and planning
- self-improvement as a future capability
- scheduled/background work as a future capability
- subagents as a future path for city-wide institutions

Hermes Agent reference: https://github.com/nousresearch/hermes-agent

## In-Game Loop

Every tick:

1. Deterministic simulation updates movement, schedules, needs, health, money, and inventory.
2. The engine creates observations, including social opportunities when citizens naturally cross paths.
3. The cognition pipeline chooses a small number of citizens that deserve LLM reasoning.
4. Each chosen citizen retrieves relevant memories.
5. The LLM writes thoughts, plans, memories, reflections, and optional conversations.
6. Conversations write relationship memories for both citizens.
7. Relationship scores evolve from stranger to acquaintance to friend to trusted friend.
8. The UI streams visible thoughts, conversations, memory updates, and relationship context.

## Auto Mode

Auto Mode is the playable version of the autonomy loop. It starts the city and keeps ticks flowing while the player observes.

In Auto Mode, citizens do not need direct player commands to talk. The backend emits social opportunities when citizens share a location or cross paths, and LLM cognition turns important opportunities into conversations.

## Relationship Development

A first meeting starts as a stranger relationship. Repeated positive conversations increase:

- familiarity
- warmth
- trust

When those values pass thresholds, the relationship becomes:

- Acquaintance
- Friend
- Trusted friend

The conversation is saved to durable memory for both citizens so future conversations can reference past interactions.

## Future Hermes-Style Extensions

Good next steps:

- citizen self-improvement journals
- profession-specific learned skills
- nightly memory consolidation
- autonomous city institutions, such as hospital, school, bank, and mayor agents
- background scheduled simulation jobs
- subagent delegation for major city crises
