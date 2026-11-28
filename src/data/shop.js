// Things coins can buy. Bats change the blade colour and give a small edge;
// broadcast looks regrade the picture.
export const BATS = [
  { id: 'classic', name: 'Club Classic', price: 0, level: 1, colors: ['#8d603b', '#d9b682', '#f2d6a4'], timing: 0, power: 0, blurb: 'English willow. No frills.' },
  { id: 'ember', name: 'Ember Edge', price: 350, level: 2, colors: ['#7a2415', '#d8553a', '#f6a184'], timing: 0.03, power: 0.03, blurb: 'A little more forgiving on timing.' },
  { id: 'glacier', name: 'Glacier', price: 700, level: 3, colors: ['#1c5d8f', '#5fb4e6', '#c9ecff'], timing: 0.06, power: 0.02, blurb: 'Big sweet spot for clean timing.' },
  { id: 'carbon', name: 'Carbon Strike', price: 1200, level: 5, colors: ['#15181c', '#3c444d', '#8a96a3'], timing: 0.03, power: 0.08, blurb: 'Stiff spine. Clears the rope more often.' },
  { id: 'gold', name: 'Golden Blade', price: 2500, level: 8, colors: ['#8a6410', '#e9bf3c', '#fff0a8'], timing: 0.07, power: 0.09, blurb: 'The best willow money can buy.' },
]

export const LOOKS = [
  { id: 'dusk', name: 'Sunset', price: 0, level: 1, filter: 'none', blurb: 'The classic evening start.' },
  { id: 'night', name: 'Floodlit night', price: 400, level: 2, filter: 'brightness(.8) contrast(1.14) saturate(.92) hue-rotate(-8deg)', blurb: 'Late finish under the lights.' },
  { id: 'golden', name: 'Golden hour', price: 400, level: 3, filter: 'brightness(1.06) saturate(1.2) sepia(.2)', blurb: 'Warm afternoon glow.' },
  { id: 'vivid', name: 'Broadcast HDR', price: 900, level: 6, filter: 'contrast(1.12) saturate(1.34)', blurb: 'Punchy colour, like the big screen.' },
]

export const batById = id => BATS.find(bat => bat.id === id) || BATS[0]
export const lookById = id => LOOKS.find(look => look.id === id) || LOOKS[0]
