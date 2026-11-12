export const colorGroups = [
  {
    label: "Neutral",
    colors: [
      "White",
      "gray",
      "black",
      "silver",
      "pearl white",
      "cement gray",
      "metallic gray",
      "metallic black",
      "dark silver",
    ],
  },
  {
    label: "Vibrant",
    colors: [
      "Red",
      "blue",
      "light blue",
      "green",
      "orange",
      "yellow",
      "purple",
      "pink",
    ],
  },
  {
    label: "Dark",
    colors: [
      "Maroon (dark red)",
      "dark blue",
      "dark green",
      "dark purple",
    ],
  },
  {
    label: "Earth Tones",
    colors: [
      "Brown",
      "beige",
      "cream",
      "olive green",
      "brick orange",
    ],
  },
  {
    label: "Pastel",
    colors: [
      "Mint green",
      "pastel blue",
      "pastel green",
      "pastel pink",
      "pastel cream",
    ],
  },
  {
    label: "สีเมทัลลิก",
    colors: [
      "Gold",
      "bronze",
      "champagne gold",
      "copper orange",
      "rose gold",
    ],
  },
] as const;

export const carColors = colorGroups.flatMap((group) => group.colors);