/**
 * Design tokens for places CSS variables cannot reach (Three.js materials).
 * The same values are declared in src/app/globals.css; tests/theme.test.ts keeps them in sync.
 *
 * Palette: navy = primary navigation / key elements, white + light gray = surfaces,
 * restrained blue = routes & selection, teal = active states / start, orange = selected destination.
 */
export const colors = {
  navy900: "#0b1f3a",
  navy800: "#10294d",
  navy700: "#183a68",
  blue600: "#2f6fda",
  blue400: "#6b9be8",
  blue100: "#dbe7fb",
  teal600: "#0f9488",
  teal100: "#d5f1ee",
  orange500: "#f08a24",
  orange100: "#fde8cf",
  gray50: "#f6f8fb",
  gray100: "#eef1f6",
  gray200: "#dde3ec",
  gray300: "#c3ccd9",
  gray500: "#7a8798",
  gray700: "#3b4757",
  white: "#ffffff",
} as const;

/** Colours of 3D room tiles by state / type. */
export const sceneColors = {
  slab: "#d3dae5",
  wall: "#f7f9fc",
  wallEdge: "#aeb9c9",
  corridor: "#e4e9f1",
  room: "#f1f4f9",
  roomOffice: "#e3ecfa",
  roomService: "#ece9e2",
  door: colors.teal600,
  stairs: "#b9c4d6",
  elevator: colors.navy700,
  hover: colors.blue400,
  selected: colors.blue600,
  destination: colors.orange500,
  start: colors.teal600,
  route: colors.blue600,
  routeCasing: colors.white,
  ground: "#e9eef4",
} as const;

export type RoomVisualState = "default" | "hover" | "selected" | "destination" | "start";
