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

Runtime memory is not written back to YAML. The YAML is the immutable persona and seed memory. During play, memories, reflections, conversations, and relationship changes are written to browser session memory or the configured database. That keeps production deployments safe and lets the same persona develop differently for each player session.

Use `ACTIVE_CITIZEN_IDS=all` to activate every profile, or provide a comma-separated list for a custom cast.
