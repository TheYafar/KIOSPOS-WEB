package com.kioskpos.web;

import java.time.LocalDate;
import java.time.ZoneId;

/** El "hoy" del negocio es el de Venezuela, no el del servidor (que en Docker corre en UTC). */
public final class Fechas {

    public static final ZoneId ZONA = ZoneId.of("America/Caracas");

    private Fechas() {
    }

    public static LocalDate hoy() {
        return LocalDate.now(ZONA);
    }
}
