import { describe, expect, it } from 'vitest'
import { isIpPrivadoOuReservado as bloqueado } from '../src/lib/urlGuard'

describe('isIpPrivadoOuReservado', () => {
  it('bloqueia IPv4 privado, loopback, metadata de nuvem, CGNAT e faixas reservadas', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '0.0.0.0', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '198.18.0.1', '198.19.255.255', '192.0.0.8', '192.0.2.1', '198.51.100.7', '203.0.113.9', '224.0.0.1', '255.255.255.255']) {
      expect(bloqueado(ip), ip).toBe(true)
    }
  })

  it('libera IPv4 público', () => {
    for (const ip of ['8.8.8.8', '177.10.20.30', '172.32.0.1', '198.20.0.1', '100.128.0.1', '203.0.114.1']) expect(bloqueado(ip), ip).toBe(false)
  })

  it('bloqueia IPv6 interno nas várias notações, inclusive IPv4 embutido em hexadecimal', () => {
    for (const ip of [
      '::1', '::', '[::1]', 'fe80::1', 'fec0::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1', '100::1',
      '::ffff:10.0.0.1', '::ffff:a00:1', '::FFFF:A00:1', '0:0:0:0:0:ffff:7f00:1', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe',
      '64:ff9b::a00:1', '64:ff9b::10.0.0.1', '::10.0.0.1',
    ]) {
      expect(bloqueado(ip), ip).toBe(true)
    }
  })

  it('libera IPv6 público e IPv4 público embutido', () => {
    for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '::ffff:808:808', '64:ff9b::808:808']) expect(bloqueado(ip), ip).toBe(false)
  })

  it('o que não é IP é recusado por precaução', () => {
    for (const ip of ['', 'localhost', '999.1.1.1', 'zzzz::1', '1:2:3:4:5:6:7:8:9']) expect(bloqueado(ip), ip).toBe(true)
  })
})
