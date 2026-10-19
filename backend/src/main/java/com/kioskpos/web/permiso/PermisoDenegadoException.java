package com.kioskpos.web.permiso;

/** El negocio no está al día (o suspendido): no se renueva el permiso de cobro. */
public class PermisoDenegadoException extends RuntimeException {
    public PermisoDenegadoException(String mensaje) {
        super(mensaje);
    }
}
