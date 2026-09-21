# Class Diagram Syntax

Class diagrams show object-oriented structures.

## Class Definition

```plantuml
@startuml
class User {
    - id: UUID
    - email: String
    # passwordHash: String
    + name: String
    --
    + authenticate(password: String): Boolean
    + updateProfile(data: ProfileData): void
    - hashPassword(password: String): String
}
@enduml
```

## Visibility Modifiers

| Symbol | Meaning |
| --- | --- |
| `-` | Private |
| `+` | Public |
| `#` | Protected |
| `~` | Package |

## Relationships

```plantuml
@startuml
Class01 <|-- Class02 : Inheritance
Class03 *-- Class04 : Composition
Class05 o-- Class06 : Aggregation
Class07 --> Class08 : Association
Class09 -- Class10 : Link
Class11 ..> Class12 : Dependency
Class13 ..|> Class14 : Realization
Class15 -- Class16 : Association
@enduml
```

| Symbol | Relationship |
| --- | --- |
| `<\|--` | Inheritance (extends) |
| `*--` | Composition (contains, lifecycle bound) |
| `o--` | Aggregation (contains, independent lifecycle) |
| `-->` | Association (uses) |
| `..>` | Dependency (uses temporarily) |
| `..\|>` | Realization (implements) |

## Cardinality

```plantuml
@startuml
Customer "1" --> "*" Order : places
Order "1" --> "1..*" LineItem : contains
Product "0..1" --> "*" Review : has
@enduml
```

## Stereotypes and Notes

```plantuml
@startuml
class User <<Entity>>
interface UserRepository <<Repository>>
abstract class BaseService <<Service>>

note right of User
    This is the main
    user entity
end note

note "Shared note" as N1
User .. N1
UserRepository .. N1
@enduml
```

## Packages and Namespaces

```plantuml
@startuml
package "Domain Layer" {
    class User
    class Order
}

package "Infrastructure Layer" {
    class UserRepository
    class OrderRepository
}

User --> UserRepository
Order --> OrderRepository
@enduml
```

## Complete Example

```plantuml
@startuml
title E-Commerce Domain Model

package "Domain" {
    class User <<Entity>> {
        - id: UUID
        - email: String
        - passwordHash: String
        + name: String
        --
        + authenticate(password): Boolean
        + placeOrder(cart: Cart): Order
    }

    class Order <<Entity>> {
        - id: UUID
        - orderDate: DateTime
        - status: OrderStatus
        --
        + calculateTotal(): Money
        + cancel(): void
        + ship(): void
    }

    class OrderItem <<ValueObject>> {
        - productId: UUID
        - quantity: Integer
        - unitPrice: Money
        --
        + subtotal(): Money
    }

    class Product <<Entity>> {
        - id: UUID
        - name: String
        - price: Money
        - stock: Integer
        --
        + reserve(quantity): Boolean
        + release(quantity): void
    }

    enum OrderStatus {
        PENDING
        CONFIRMED
        SHIPPED
        DELIVERED
        CANCELLED
    }
}

User "1" --> "*" Order : places
Order "1" *-- "*" OrderItem : contains
OrderItem "*" --> "1" Product : references
Order --> OrderStatus : has
@enduml
```
