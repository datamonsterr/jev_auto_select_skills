# Sequence Diagram Syntax

Sequence diagrams show interactions between participants.

## Participants

```plantuml
@startuml
actor User
participant "Web Server" as WS
entity Database
collections "Message Queue" as MQ
control Controller
boundary API
@enduml
```

| Keyword | Shape |
| --- | --- |
| `participant` | Rectangle (default) |
| `actor` | Stick figure |
| `boundary` | Circle with line |
| `control` | Circle with arrow |
| `entity` | Circle with underline |
| `database` | Cylinder |
| `collections` | Stacked rectangles |
| `queue` | Queue shape |

## Arrow Types

```plantuml
@startuml
Alice -> Bob: Solid line
Alice --> Bob: Dashed line
Alice ->> Bob: Thin arrow
Alice -\ Bob: Half arrow top
Alice -/ Bob: Half arrow bottom
Alice ->x Bob: Lost message
Alice -[#red]> Bob: Colored
@enduml
```

## Activation and Lifelines

```plantuml
@startuml
participant Client
participant Server

Client -> Server: Request
activate Server
Server --> Client: Response
deactivate Server

' Shorthand
Client -> Server ++: Request
Server --> Client --: Response

' Nested activation
Client -> Server ++: Outer
Server -> Server ++: Inner
Server --> Server --: Done inner
Server --> Client --: Done outer
@enduml
```

## Groups, Loops, and Alternatives

```plantuml
@startuml
participant User
participant API
participant DB

User -> API: Request

alt Success Case
    API -> DB: Query
    DB --> API: Data
    API --> User: 200 OK
else Failure Case
    API --> User: 500 Error
end

loop Every 5 seconds
    API -> DB: Health check
end

opt Optional Step
    API -> API: Log request
end

par Parallel Execution
    API -> Service1: Call 1
and
    API -> Service2: Call 2
end

critical Critical Section
    API -> DB: Transaction
end
@enduml
```

## Notes

```plantuml
@startuml
participant A
participant B

A -> B: Message

note left: Note on left
note right: Note on right
note over A: Note over A
note over A, B: Note spanning
@enduml
```

## Complete Example

```plantuml
@startuml
title Authentication Flow
autonumber

actor User
participant "Frontend" as FE
participant "API Gateway" as API
participant "Auth Service" as Auth
database "User DB" as DB

User -> FE: Enter credentials
activate FE

FE -> API: POST /login
activate API

API -> Auth: Validate credentials
activate Auth

Auth -> DB: Query user
activate DB
DB --> Auth: User record
deactivate DB

alt Valid credentials
    Auth --> API: JWT token
    API --> FE: 200 OK + token
    FE --> User: Redirect to dashboard
else Invalid credentials
    Auth --> API: Unauthorized
    API --> FE: 401 Error
    FE --> User: Show error message
end

deactivate Auth
deactivate API
deactivate FE
@enduml
```
