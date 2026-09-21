# State and Component Diagrams

## State Diagram Syntax

State diagrams show state machines.

### Basic Syntax

```plantuml
@startuml
[*] --> Idle
Idle --> Processing : start
Processing --> Complete : finish
Processing --> Error : fail
Error --> Idle : reset
Complete --> [*]
@enduml
```

### Composite States

```plantuml
@startuml
[*] --> Active

state Active {
    [*] --> Running
    Running --> Paused : pause
    Paused --> Running : resume
    Running --> [*] : stop
}

Active --> Terminated : shutdown
Terminated --> [*]
@enduml
```

### Concurrent States

```plantuml
@startuml
[*] --> Active

state Active {
    state "Thread 1" as t1 {
        [*] --> Idle1
        Idle1 --> Running1
        Running1 --> Idle1
    }
    --
    state "Thread 2" as t2 {
        [*] --> Idle2
        Idle2 --> Running2
        Running2 --> Idle2
    }
}

Active --> [*]
@enduml
```

---

## Component Diagram Syntax

Component diagrams show system structure.

```plantuml
@startuml
package "Frontend" {
    [Web App] as webapp
    [Mobile App] as mobile
}

package "Backend" {
    [API Gateway] as api
    [Auth Service] as auth
    [Order Service] as order
    [User Service] as user
}

package "Data" {
    database "PostgreSQL" as db
    database "Redis" as cache
}

webapp --> api
mobile --> api
api --> auth
api --> order
api --> user
auth --> db
order --> db
user --> db
auth --> cache
@enduml
```

---

## Deployment Diagram Syntax

Deployment diagrams show infrastructure.

```plantuml
@startuml
node "Web Server" {
    [Nginx] as nginx
    [Node.js App] as app
}

node "Database Server" {
    database "PostgreSQL" as db
}

cloud "AWS" {
    [S3 Bucket] as s3
    [CloudFront] as cdn
}

nginx --> app
app --> db
app --> s3
cdn --> s3
@enduml
```
