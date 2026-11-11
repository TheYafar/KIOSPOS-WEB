package com.kioskpos.web.contabilidad;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface ContabilidadDocRepository extends JpaRepository<ContabilidadDoc, ContabilidadDoc.Clave> {

    /** Bloquea la fila al guardar: dos equipos a la vez no se pisan la versión. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ContabilidadDoc> findWithLockById(ContabilidadDoc.Clave id);
}
