package com.kioskpos.web.tenant;

import jakarta.persistence.EntityManagerFactory;
import org.springframework.orm.jpa.EntityManagerHolder;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Activa la barrera de base de datos (Row Level Security) en cada transacción.
 *
 * <p>Justo después de que la transacción física empieza (autocommit ya en false),
 * fija el GUC de sesión {@code app.current_negocio_id} con alcance de transacción
 * ({@code set_config(..., is_local = true)}, equivalente a {@code SET LOCAL}) leyendo
 * el valor de {@link NegocioContext}. Las policies de RLS en Postgres comparan
 * {@code negocio_id} contra ese GUC.
 *
 * <p>Si {@link NegocioContext} no tiene nada fijado, deliberadamente NO se llama a
 * {@code set_config}: el GUC queda sin valor en esta transacción. Ojo: tras un
 * {@code SET LOCAL} previo en la misma conexión del pool, {@code current_setting(...,
 * true)} no devuelve NULL sino cadena vacía {@code ''}; por eso las policies usan
 * {@code NULLIF(current_setting(...), '')::bigint}, de modo que "sin negocio" (NULL o
 * '') no matchea ninguna fila (fail-closed) en vez de abrir el acceso o reventar el
 * cast a bigint.
 */
public class TenantAwareJpaTransactionManager extends JpaTransactionManager {

    public TenantAwareJpaTransactionManager(EntityManagerFactory entityManagerFactory) {
        super(entityManagerFactory);
    }

    @Override
    protected void doBegin(Object transactionObject, TransactionDefinition definition) {
        super.doBegin(transactionObject, definition);
        applyNegocioContext();
    }

    private void applyNegocioContext() {
        Long negocioId = NegocioContext.get();
        if (negocioId == null) {
            return;
        }
        Object resource = TransactionSynchronizationManager.getResource(getEntityManagerFactory());
        if (!(resource instanceof EntityManagerHolder holder)) {
            return;
        }
        holder.getEntityManager()
                .createNativeQuery("SELECT set_config('app.current_negocio_id', ?1, true)")
                .setParameter(1, String.valueOf(negocioId))
                .getSingleResult();
    }
}
