export function showStadium(field) {
  field.reset()
  if (field.textures.has('stadium')) {
    const { width, height } = field.scale
    field.add.image(width / 2, height / 2, 'stadium').setDisplaySize(width, height)
  }
  field.bake()
  field.draw()
}
