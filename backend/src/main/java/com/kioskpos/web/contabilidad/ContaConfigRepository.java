package com.kioskpos.web.contabilidad;

import org.springframework.data.jpa.repository.JpaRepository;

/** Config del modo automático (una fila por negocio; PK = negocio_id, bajo RLS). */
public interface ContaConfigRepository extends JpaRepository<ContaConfig, Long> {
}
