---
title: Schema diagram (ERD)
description: See the schema as a diagram of tables and relations, move tables around, and create virtual relations by dragging.
category: Data
order: 6
related: [schema-browser, relationships]
---

# Schema diagram (ERD)

Click **Diagram** in the top bar to open the schema as a diagram. It opens in its own workspace tab, one per schema.

![The schema diagram](/help/shots/erd-{theme}.png)

## Reading the diagram

- Each box is a table. Keys come first: a key icon marks primary keys and a link icon marks foreign keys. Types are shown on the right. A `?` after a name means the column accepts NULL, `U` marks a unique index and `D` a default value (hover a column for the details: default, referenced column, composite unique indexes).
- A line links the column that holds a foreign key to the column it points at. The end of the line shows the cardinality: a crow's foot means "many", a bar means "one".
- **Dashed blue lines** are virtual relations (declared in DbLocal, not in the database).
- Views have a dashed outline.
- Tables with more than 40 columns show the keys and the first columns, then "+N more columns".

## Move around

- Scroll to zoom, drag the background to pan. The minimap and the controls at the bottom left help with big schemas.
- Zoom far out and tables collapse to just their name, so a schema with hundreds of tables stays readable.
- **Find a table…** centres and highlights it.

## Explore a table

- **Click** a table to highlight it and its direct neighbours; the rest fades. Click the background to clear.
- **Hover** a line to highlight the two columns it links.
- **Double click** a table to open its data in a tab.
- With a table selected, **Show only tables near X** keeps only the tables within N relations of it (1 to 4 hops). The choice is in the address, so you can share the link.

## Layout {#layout}

The first layout is computed automatically. Drag tables to arrange them; positions are saved for the connection and schema and come back next time. **Reset layout** goes back to the automatic one.

## Create a virtual relation

Drag from a column of one table to a column of another. Pick the cardinality, optionally name it, and save. The relation appears in the grid and in the record panel like any other. The database is not changed.

## Export

**PNG** and **SVG** export what is on screen (with the filter applied) at full size.
