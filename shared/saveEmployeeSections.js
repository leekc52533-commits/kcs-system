// Remove only completed operations so a retry cannot repeat a successful section.
export async function saveEmployeeSections(pending) {
  for (const [key, operation] of Object.entries(pending)) {
    await operation()
    if (pending[key] === operation) delete pending[key]
  }
}
