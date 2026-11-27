-- Sky bridges between buildings 1, 2 and 3 are navigation edges of type 'bridge'.
-- Only needed for a database created from an older schema.sql (a fresh install already has it).
alter table public.navigation_edges drop constraint if exists navigation_edges_edge_type_check;
alter table public.navigation_edges
  add constraint navigation_edges_edge_type_check check (edge_type in ('corridor', 'door', 'stairs', 'elevator', 'bridge'));
