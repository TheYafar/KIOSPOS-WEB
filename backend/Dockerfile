# Backend KioskPOS Web — build con Maven, corre sobre JRE 21.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B -o dependency:go-offline || mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/kioskpos-web-backend-*.jar app.jar
EXPOSE 8080
# Flags para arrancar rápido en instancias chicas (Render free, VPS 1GB):
# SerialGC (poca RAM), TieredStopAtLevel=1 (JIT rápido de arranque).
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-jar", "app.jar"]
