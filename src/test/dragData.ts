// jsdom has no DataTransfer, so drag-and-drop tests pass this minimal stand-in.
export function makeDataTransfer() {
  const data: Record<string, string> = {}
  return {
    data,
    effectAllowed: 'all',
    setData: (type: string, value: string) => {
      data[type] = value
    },
    getData: (type: string) => data[type] ?? '',
  }
}
