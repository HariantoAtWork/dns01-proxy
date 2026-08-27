export type IpFamily = 4 | 6
export type PublicIpOrigin = 'host' | 'browser'

export interface PublicIpAddress {
  address: string
  family: IpFamily
  sources: string[]
  origins: PublicIpOrigin[]
}

export interface VisitIpAddress {
  address: string
  family: IpFamily
  public: boolean
  via: string
}

export interface PublicNetworkResult {
  success: boolean
  message?: string
  host: PublicIpAddress[]
  visit: VisitIpAddress | null
  checkedAt: string
}
