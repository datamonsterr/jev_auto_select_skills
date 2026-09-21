# Activity Diagram Syntax

Activity diagrams show workflows and processes.

## Basic Syntax

```plantuml
@startuml
start
:First activity;
:Second activity;
stop
@enduml
```

## Conditions

```plantuml
@startuml
start
:Receive order;

if (In stock?) then (yes)
    :Process payment;
    if (Payment successful?) then (yes)
        :Ship order;
    else (no)
        :Cancel order;
    endif
else (no)
    :Notify customer;
endif

stop
@enduml
```

## Swimlanes

```plantuml
@startuml
|Customer|
start
:Place order;

|Sales|
:Review order;
if (Valid?) then (yes)
    :Approve;
else (no)
    :Reject;
    stop
endif

|Warehouse|
:Pick items;
:Pack shipment;

|Shipping|
:Ship order;

|Customer|
:Receive order;
stop
@enduml
```

## Fork and Join

```plantuml
@startuml
start
:Receive order;

fork
    :Check inventory;
fork again
    :Verify payment;
fork again
    :Validate address;
end fork

:Process order;
stop
@enduml
```

## Complete Example

```plantuml
@startuml
title Order Processing Workflow

| #LightBlue | Customer |
start
:Submit order;

| #LightGreen | System |
:Validate order;

if (Valid order?) then (yes)
    fork
        :Check inventory;
    fork again
        :Verify payment;
    end fork

    if (All checks pass?) then (yes)
| #LightYellow | Warehouse |
        :Reserve items;
        :Generate packing slip;

| #LightPink | Shipping |
        :Schedule pickup;
        :Update tracking;

| #LightBlue | Customer |
        :Receive confirmation;
    else (no)
| #LightGreen | System |
        :Send failure notification;
| #LightBlue | Customer |
        :Receive rejection;
    endif
else (no)
| #LightBlue | Customer |
    :Show validation errors;
endif

stop
@enduml
```
