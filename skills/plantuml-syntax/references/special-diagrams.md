# Special Diagram Types

Non-UML diagram types supported by PlantUML.

## Entity Relationship Diagram

```plantuml
@startuml
entity User {
    * id : UUID <<PK>>
    --
    * email : String <<UK>>
    * password_hash : String
    name : String
    created_at : DateTime
}

entity Post {
    * id : UUID <<PK>>
    --
    * author_id : UUID <<FK>>
    * title : String
    content : Text
    status : String
    published_at : DateTime
}

entity Comment {
    * id : UUID <<PK>>
    --
    * post_id : UUID <<FK>>
    * user_id : UUID <<FK>>
    content : Text
    created_at : DateTime
}

entity Tag {
    * id : UUID <<PK>>
    --
    * name : String <<UK>>
}

entity PostTag {
    * post_id : UUID <<FK,PK>>
    * tag_id : UUID <<FK,PK>>
}

User ||--o{ Post : writes
User ||--o{ Comment : writes
Post ||--o{ Comment : has
Post ||--o{ PostTag : has
Tag ||--o{ PostTag : has
@enduml
```

---

## JSON Visualization

```plantuml
@startjson
{
    "user": {
        "id": "123",
        "name": "John Doe",
        "email": "john@example.com",
        "roles": ["admin", "user"],
        "profile": {
            "avatar": "https://example.com/avatar.png",
            "bio": "Software developer"
        }
    },
    "settings": {
        "theme": "dark",
        "notifications": true
    }
}
@endjson
```

---

## MindMap

```plantuml
@startmindmap
* Project
** Planning
*** Requirements
*** Design
*** Timeline
** Development
*** Backend
**** API
**** Database
*** Frontend
**** Components
**** Styling
** Testing
*** Unit Tests
*** Integration Tests
*** E2E Tests
** Deployment
*** Staging
*** Production
@endmindmap
```

---

## Gantt Chart

```plantuml
@startgantt
Project starts 2024-01-01
[Planning] lasts 14 days
[Design] lasts 21 days
[Design] starts at [Planning]'s end

[Backend Development] lasts 42 days
[Backend Development] starts at [Design]'s end

[Frontend Development] lasts 35 days
[Frontend Development] starts at [Design]'s end

[Integration] lasts 14 days
[Integration] starts at [Backend Development]'s end
[Integration] starts at [Frontend Development]'s end

[Testing] lasts 21 days
[Testing] starts at [Integration]'s end

[Deployment] lasts 7 days
[Deployment] starts at [Testing]'s end
@endgantt
```

---

## Quick Reference

### ER

```plantuml
@startuml
entity User {
    * id : UUID <<PK>>
    --
    * email : String <<UK>>
}
entity Post {
    * id : UUID <<PK>>
    * author_id : UUID <<FK>>
}
User ||--o{ Post : writes
@enduml
```

### JSON

```plantuml
@startjson
{
    "key": "value",
    "array": [1, 2, 3]
}
@endjson
```

### MindMap

```plantuml
@startmindmap
* Root
** Branch 1
*** Leaf
** Branch 2
@endmindmap
```

### Gantt

```plantuml
@startgantt
[Task 1] lasts 10 days
[Task 2] starts at [Task 1]'s end
[Task 2] lasts 5 days
@endgantt
```
