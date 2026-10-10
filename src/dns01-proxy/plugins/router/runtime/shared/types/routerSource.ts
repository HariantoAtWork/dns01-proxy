export type RouterProtocol = 'tcp' | 'udp'

export interface RouterPortMap {
  protocol: RouterProtocol
  listenPort: number
  targetPort: number
}

export interface RouterSource {
  id: string
  /** Public DNS labels (documentation + ownership); L4 routing is by listen port. */
  domainNames: string[]
  targetId: string
  portMaps: RouterPortMap[]
  enabled: boolean
}

export interface RouterSourcesFile {
  version: 1
  sources: RouterSource[]
}

export type RouterSourceInput = Partial<Omit<RouterSource, 'id'>> & {
  id?: string
  domainNames?: string[]
  targetId?: string
  portMaps?: RouterPortMap[]
}
