## ADDED Requirements

### Requirement: Consumer settings and knowledge workflows have complete dark surfaces

When `theme-mode=dark`, the consumer model selector and the visible knowledge
base Document, Wiki, and Graph workflows SHALL use the same dark semantic
surface, text, border, hover, active, and popup tokens as the product shell.
An open model selector MUST paint above every sibling selector and remain
readable. Directory trees, tabs, toolbars, filters, folder/document cards,
drawers, search controls, and teleported popups MUST NOT retain light-only
backgrounds. Light mode and all existing business behavior SHALL remain
unchanged.

#### Scenario: A dark model selector is opened

- **WHEN** an operator or consumer opens any model selector in dark mode
- **THEN** its popup and options render above later controls with readable
  selected, unlocked, locked, hover, and border states

#### Scenario: A knowledge base is viewed in dark mode

- **WHEN** the user visits Document, Wiki, or Graph tabs in dark mode
- **THEN** every visible structural component uses dark semantic tokens while
  preserving the existing content, actions, and navigation
