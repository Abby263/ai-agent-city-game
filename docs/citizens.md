# Citizen Profiles

Every AgentCity citizen is defined by one YAML file in:

```text
backend/app/citizens/profiles/
```

To add a citizen, create a new file such as:

```text
backend/app/citizens/profiles/cit_027_maya_rivera.yaml
```

Minimum useful shape:

```yaml
citizen_id: cit_027
name: Maya Rivera
age: 14
profession: Student
active: true
work_location_id: loc_school
position: [6, 6]
skills: [art, robotics]
mood: Curious
current_thought: I want to find someone who understands my project idea.
short_term_goals:
  - Ask one classmate about robotics club
long_term_goals:
  - Build a real friendship circle in Navora
memory_summary: Maya Rivera is a new student in Navora.
seed_memories:
  - memory_id: mem_seed_cit_027
    content: Maya Rivera recently joined the student circle and wants to belong.
```

`active: true` means the citizen appears in the default playable cast when `ACTIVE_CITIZEN_IDS=profile`.

Runtime memory is not written back to YAML. The YAML is the immutable persona and seed memory.

During browser play, each active citizen gets an isolated short-term memory store:

```text
agentcity.v10.memory.<citizen_id>
```

The cognition endpoint receives a map of private memories by citizen id. The
LangGraph exchange only passes each node the memory for the citizen currently
speaking. Public transcript lines can cross the boundary; private memories cannot.

In durable server mode, the same rule is enforced by retrieving memories by
`citizen_id` before each private turn. This keeps the mental model simple:
every citizen develops their own memory over time, and conversations are how
facts move between people.

Relationship changes are still stored separately because relationships are shared
game state, not a private diary. That keeps production deployments safe and lets
the same persona develop differently for each player session.

Use `ACTIVE_CITIZEN_IDS=all` to activate every profile, or provide a comma-separated list for a custom cast.
