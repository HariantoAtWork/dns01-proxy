export interface RouterTarget {
  id: string
  /** Short operator label, e.g. `sunshine`. */
  name: string
  /** Hostname or IP of the backend machine. */
  host: string
  notes?: string | null
  enabled: boolean
}

export interface RouterTargetsFile {
  version: 1
  targets: RouterTarget[]
}

export type RouterTargetInput = Partial<Omit<RouterTarget, 'id'>> & {
  id?: string
  name?: string
  host?: string
}
