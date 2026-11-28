// Lets Node import the game modules that reference image and sound files.
export async function load(url, context, nextLoad) {
  if (/\.(wav|webp|png|css|glb)(\?.*)?$/.test(url)) return { format: 'module', shortCircuit: true, source: 'export default ""' }
  return nextLoad(url, context)
}
