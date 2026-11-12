/*
 * Lógica de la web de estudio.
 * Sin dependencias: funciona abriendo index.html directamente (file://).
 */
(function () {
  "use strict";

  var CLAVE_ALMACEN = "persistencia-estudio-v1";
  var CLAVE_TEMA = "persistencia-estudio-tema";

  var ejercicios = window.EJERCICIOS;
  var niveles = window.NIVELES;

  var elementoContenido = document.getElementById("contenido");
  var botonReiniciarProgreso = document.getElementById("botonReiniciar");
  var elementoProgresoTexto = document.getElementById("progresoTexto");
  var elementoProgresoRelleno = document.getElementById("progresoRelleno");
  var botonTema = document.getElementById("botonTema");

  var progreso = cargarProgreso();

  /* ---------------------------------------------------------------
   * Almacenamiento (localStorage puede no estar disponible)
   * ------------------------------------------------------------- */
  function cargarProgreso() {
    var progresoVacio = { actual: 1, ejercicios: {} };
    try {
      var textoGuardado = window.localStorage.getItem(CLAVE_ALMACEN);
      if (!textoGuardado) {
        return progresoVacio;
      }
      var progresoGuardado = JSON.parse(textoGuardado);
      if (!progresoGuardado || typeof progresoGuardado.ejercicios !== "object") {
        return progresoVacio;
      }
      if (typeof progresoGuardado.actual !== "number") {
        progresoGuardado.actual = 1;
      }
      return progresoGuardado;
    } catch (error) {
      return progresoVacio;
    }
  }

  function guardarProgreso() {
    try {
      window.localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(progreso));
    } catch (error) {
      /* Sin almacenamiento: la web sigue funcionando, solo no recuerda. */
    }
  }

  function obtenerEstado(idEjercicio) {
    var clave = String(idEjercicio);
    if (!progreso.ejercicios[clave]) {
      progreso.ejercicios[clave] = {
        codigo: null,
        justificacion: "",
        revelado: false,
        resultado: null
      };
    }
    return progreso.ejercicios[clave];
  }

  function buscarEjercicio(idEjercicio) {
    for (var i = 0; i < ejercicios.length; i++) {
      if (ejercicios[i].id === idEjercicio) {
        return ejercicios[i];
      }
    }
    return ejercicios[0];
  }

  /* ---------------------------------------------------------------
   * Utilidades de texto
   * ------------------------------------------------------------- */
  function escapar(texto) {
    return String(texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Escapa el texto y convierte {{codigo}} en <code>codigo</code>. */
  function formatearTexto(texto) {
    return escapar(texto).replace(/\{\{([\s\S]+?)\}\}/g, "<code>$1</code>");
  }

  function rellenarConCeros(numero) {
    return numero < 10 ? "0" + numero : String(numero);
  }

  /* ---------------------------------------------------------------
   * Resaltado de sintaxis de Kotlin
   * ------------------------------------------------------------- */
  var PALABRAS_CLAVE = {};
  (
    "package import class interface object fun val var if else when for while return is in as " +
    "try catch finally throw null true false this super override private protected public internal " +
    "abstract open sealed data suspend companion init by lateinit const enum inline reified"
  ).split(" ").forEach(function (palabra) {
    PALABRAS_CLAVE[palabra] = true;
  });

  var PATRON_KOTLIN = new RegExp(
    "(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)" + // 1 comentario
    "|(\"(?:[^\"\\\\\\n]|\\\\.)*\")" +         // 2 cadena
    "|(@[A-Za-z_]\\w*)" +                      // 3 anotación
    "|(\\b\\d[\\d_]*[Lf]?\\b)" +               // 4 número
    "|(\\b[A-Za-z_]\\w*\\b)" +                 // 5 identificador
    "|(\\n)" +                                 // 6 salto de línea
    "|([^\\n])",                               // 7 otro carácter
    "g"
  );

  /** Devuelve un arreglo con el HTML de cada línea del código. */
  function resaltarKotlin(codigo) {
    var html = "";
    var coincidencia;
    PATRON_KOTLIN.lastIndex = 0;

    while ((coincidencia = PATRON_KOTLIN.exec(codigo)) !== null) {
      if (coincidencia[1] !== undefined) {
        html += '<span class="t-com">' + escapar(coincidencia[1]) + "</span>";
      } else if (coincidencia[2] !== undefined) {
        html += '<span class="t-str">' + escapar(coincidencia[2]) + "</span>";
      } else if (coincidencia[3] !== undefined) {
        html += '<span class="t-ann">' + escapar(coincidencia[3]) + "</span>";
      } else if (coincidencia[4] !== undefined) {
        html += '<span class="t-num">' + escapar(coincidencia[4]) + "</span>";
      } else if (coincidencia[5] !== undefined) {
        html += clasificarIdentificador(coincidencia[5], codigo.charAt(PATRON_KOTLIN.lastIndex));
      } else if (coincidencia[6] !== undefined) {
        html += "\n";
      } else {
        html += escapar(coincidencia[7]);
      }
    }
    return html.split("\n");
  }

  function clasificarIdentificador(palabra, siguienteCaracter) {
    var palabraEscapada = escapar(palabra);
    if (PALABRAS_CLAVE[palabra]) {
      return '<span class="t-kw">' + palabraEscapada + "</span>";
    }
    var empiezaConMayuscula = palabra.charAt(0) >= "A" && palabra.charAt(0) <= "Z";
    if (empiezaConMayuscula) {
      return '<span class="t-tipo">' + palabraEscapada + "</span>";
    }
    if (siguienteCaracter === "(") {
      return '<span class="t-fn">' + palabraEscapada + "</span>";
    }
    return palabraEscapada;
  }

  /**
   * Busca el índice (base 0) de la línea que corresponde a un problema.
   * "ocurrencia" indica cuál coincidencia usar cuando el texto se repite.
   */
  function encontrarIndiceDeLinea(codigo, problema) {
    var lineas = codigo.split("\n");
    var ocurrenciaBuscada = problema.ocurrencia || 1;
    var ocurrenciasVistas = 0;

    for (var i = 0; i < lineas.length; i++) {
      if (lineas[i].indexOf(problema.linea) !== -1) {
        ocurrenciasVistas += 1;
        if (ocurrenciasVistas === ocurrenciaBuscada) {
          return i;
        }
      }
    }
    return -1;
  }

  /** Construye el bloque de código numerado; las marcas resaltan líneas con problemas. */
  function construirBloqueCodigo(codigo, problemas, claseExtra) {
    var lineasHtml = resaltarKotlin(codigo);
    var insigniasPorLinea = {};

    if (problemas) {
      problemas.forEach(function (problema, posicion) {
        var indiceLinea = encontrarIndiceDeLinea(codigo, problema);
        if (indiceLinea === -1) {
          return;
        }
        if (!insigniasPorLinea[indiceLinea]) {
          insigniasPorLinea[indiceLinea] = [];
        }
        insigniasPorLinea[indiceLinea].push(posicion + 1);
      });
    }

    var cuerpo = "";
    for (var i = 0; i < lineasHtml.length; i++) {
      var numerosDeProblema = insigniasPorLinea[i];
      var estaMarcada = numerosDeProblema !== undefined;
      var textoLinea = lineasHtml[i] === "" ? " " : lineasHtml[i];
      var insignias = "";

      if (estaMarcada) {
        insignias = '<span class="insignias">' +
          numerosDeProblema.map(function (numero) {
            return '<span class="insignia">' + numero + "</span>";
          }).join("") +
          "</span>";
      }

      cuerpo += '<span class="linea' + (estaMarcada ? " linea--marcada" : "") + '">' +
        '<span class="linea__num">' + (i + 1) + "</span>" +
        '<span class="linea__texto">' + textoLinea + insignias + "</span>" +
        "</span>";
    }

    return '<pre class="codigo ' + (claseExtra || "") + '"><code>' + cuerpo + "</code></pre>";
  }

  /* ---------------------------------------------------------------
   * Cálculos de progreso
   * ------------------------------------------------------------- */
  function contarResultados() {
    var conteo = { ok: 0, medio: 0, mal: 0, total: 0 };
    ejercicios.forEach(function (ejercicio) {
      var estado = progreso.ejercicios[String(ejercicio.id)];
      if (estado && estado.resultado) {
        conteo[estado.resultado] += 1;
        conteo.total += 1;
      }
    });
    return conteo;
  }

  function actualizarProgresoSuperior() {
    var conteo = contarResultados();
    var porcentaje = Math.round((conteo.total / ejercicios.length) * 100);
    elementoProgresoTexto.textContent = conteo.total + " / " + ejercicios.length + " · " + porcentaje + "%";
    elementoProgresoRelleno.style.width = porcentaje + "%";
  }

  /* ---------------------------------------------------------------
   * Vista de un ejercicio
   * ------------------------------------------------------------- */
  function construirPuntosDeDificultad(nivel) {
    var puntos = "";
    for (var i = 1; i <= 5; i++) {
      puntos += '<i class="' + (i <= nivel ? "on" : "") + '"></i>';
    }
    return '<span class="puntos" aria-hidden="true">' + puntos + "</span>";
  }

  function nombreDeNivel(numeroNivel) {
    for (var i = 0; i < niveles.length; i++) {
      if (niveles[i].numero === numeroNivel) {
        return niveles[i].nombre;
      }
    }
    return "";
  }

  function construirSolucion(ejercicio, estado) {
    var problemasHtml = ejercicio.smells.map(function (problema, posicion) {
      return '<li class="problema">' +
        '<span class="problema__num">' + (posicion + 1) + "</span>" +
        "<div>" +
        '<h4 class="problema__titulo">' + formatearTexto(problema.titulo) + "</h4>" +
        '<p class="problema__texto">' + formatearTexto(problema.porque) + "</p>" +
        "</div></li>";
    }).join("");

    function botonResultado(valor, texto) {
      var presionado = estado.resultado === valor;
      return '<button type="button" class="boton resultado__boton resultado--' + valor + '"' +
        ' data-resultado="' + valor + '" aria-pressed="' + presionado + '">' + texto + "</button>";
    }

    return '<div class="solucion">' +
      '<section class="seccion">' +
        '<div class="seccion__cab"><h3 class="seccion__titulo">Dónde estaban los problemas</h3></div>' +
        construirBloqueCodigo(ejercicio.codigo, ejercicio.smells) +
        '<ol class="problemas">' + problemasHtml + "</ol>" +
      "</section>" +
      '<section class="seccion">' +
        '<div class="seccion__cab"><h3 class="seccion__titulo">Solución propuesta</h3></div>' +
        construirBloqueCodigo(ejercicio.solucion, null, "codigo--ok") +
        '<div class="clave"><span class="clave__etiqueta">Para el parcial</span>' +
        "<p>" + formatearTexto(ejercicio.clave) + "</p></div>" +
      "</section>" +
      '<section class="seccion">' +
        '<div class="seccion__cab"><h3 class="seccion__titulo">¿Cómo te fue?</h3></div>' +
        '<div class="resultado">' +
          botonResultado("ok", "Lo tenía") +
          botonResultado("medio", "A medias") +
          botonResultado("mal", "No lo vi") +
        "</div>" +
      "</section>" +
    "</div>";
  }

  function dibujarEjercicio() {
    var ejercicio = buscarEjercicio(progreso.actual);
    var estado = obtenerEstado(ejercicio.id);
    var codigoInicial = estado.codigo === null ? ejercicio.codigo : estado.codigo;
    var cantidadLineas = Math.max(8, codigoInicial.split("\n").length + 1);
    var esPrimero = ejercicio.id === ejercicios[0].id;
    var esUltimo = ejercicio.id === ejercicios[ejercicios.length - 1].id;
    var cantidadProblemas = ejercicio.smells.length;

    var html = '<article class="tarjeta">' +
      '<header class="tarjeta__cab">' +
        '<div class="meta">' +
          '<span class="etiqueta etiqueta--nivel">Nivel ' + ejercicio.nivel + " · " +
            escapar(nombreDeNivel(ejercicio.nivel)) + " " + construirPuntosDeDificultad(ejercicio.nivel) + "</span>" +
          (estado.revelado ? '<span class="etiqueta">' + escapar(ejercicio.tema) + "</span>" : "") +
        "</div>" +
        '<h2 class="titulo-ejercicio"><span class="numero">' + rellenarConCeros(ejercicio.id) + "</span>" +
          (estado.revelado ? escapar(ejercicio.titulo) : "Encuentra los problemas") + "</h2>" +
        '<p class="contexto">' + formatearTexto(ejercicio.contexto) + "</p>" +
      "</header>" +

      '<section class="seccion">' +
        '<div class="seccion__cab">' +
          '<h3 class="seccion__titulo">Código a revisar</h3>' +
          '<span class="aviso">' + cantidadProblemas + (cantidadProblemas === 1 ? " problema" : " problemas") + " por encontrar</span>" +
        "</div>" +
        construirBloqueCodigo(ejercicio.codigo, null) +
      "</section>" +

      '<section class="seccion">' +
        '<div class="seccion__cab"><h3 class="seccion__titulo">Tu respuesta</h3></div>' +
        '<div class="campo">' +
          '<label class="campo__etiqueta" for="campoCodigo">Corrige el código ' +
            '<span class="campo__ayuda">· editable, la tecla Tab inserta espacios</span></label>' +
          '<textarea id="campoCodigo" class="area area--codigo" spellcheck="false" autocomplete="off" ' +
            'autocapitalize="off" rows="' + cantidadLineas + '">' + escapar(codigoInicial) + "</textarea>" +
        "</div>" +
        '<div class="campo">' +
          '<label class="campo__etiqueta" for="campoJustificacion">Justifica ' +
            '<span class="campo__ayuda">· ¿qué problema hay, por qué es malo y qué consecuencia tiene?</span></label>' +
          '<textarea id="campoJustificacion" class="area" rows="5" ' +
            'placeholder="Escribe aquí tu razonamiento antes de revelar la solución…">' +
            escapar(estado.justificacion) + "</textarea>" +
        "</div>" +
        '<div class="acciones">' +
          '<button type="button" class="boton boton--primario" id="botonRevelar">' +
            (estado.revelado ? "Ocultar solución" : "Revelar solución") + "</button>" +
          '<button type="button" class="boton" id="botonRestaurar">Restaurar código original</button>' +
        "</div>" +
      "</section>" +

      '<div id="zonaSolucion">' + (estado.revelado ? construirSolucion(ejercicio, estado) : "") + "</div>" +
    "</article>" +

    '<nav class="pie" aria-label="Navegación entre ejercicios">' +
      '<button type="button" class="boton" id="botonAnterior"' + (esPrimero ? " disabled" : "") + ">← Anterior</button>" +
      '<span class="pie__posicion">Ejercicio ' + ejercicio.id + " de " + ejercicios.length + "</span>" +
      '<button type="button" class="boton" id="botonSiguiente"' + (esUltimo ? " disabled" : "") + ">Siguiente →</button>" +
    "</nav>" +
    '<p class="atajo">Atajos: <kbd>←</kbd> <kbd>→</kbd> para navegar entre ejercicios</p>';

    elementoContenido.innerHTML = html;
  }

  /* ---------------------------------------------------------------
   * Acciones
   * ------------------------------------------------------------- */
  function irAlEjercicio(idEjercicio) {
    var existe = ejercicios.some(function (ejercicio) {
      return ejercicio.id === idEjercicio;
    });
    if (!existe) {
      return;
    }
    progreso.actual = idEjercicio;
    guardarProgreso();
    dibujarTodo();
    window.scrollTo({ top: 0 });
  }

  function alternarSolucion() {
    var ejercicio = buscarEjercicio(progreso.actual);
    var estado = obtenerEstado(ejercicio.id);
    estado.revelado = !estado.revelado;
    guardarProgreso();

    // Se redibuja todo: el título y el tema solo se muestran con la solución revelada.
    dibujarEjercicio();

    if (estado.revelado) {
      document.getElementById("zonaSolucion").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function registrarResultado(valor) {
    var ejercicio = buscarEjercicio(progreso.actual);
    var estado = obtenerEstado(ejercicio.id);
    estado.resultado = estado.resultado === valor ? null : valor;
    guardarProgreso();

    var botones = document.querySelectorAll("[data-resultado]");
    Array.prototype.forEach.call(botones, function (boton) {
      var coincide = boton.getAttribute("data-resultado") === estado.resultado;
      boton.setAttribute("aria-pressed", coincide ? "true" : "false");
    });

    actualizarProgresoSuperior();
  }

  function restaurarCodigoOriginal() {
    var ejercicio = buscarEjercicio(progreso.actual);
    var estado = obtenerEstado(ejercicio.id);
    estado.codigo = null;
    guardarProgreso();
    document.getElementById("campoCodigo").value = ejercicio.codigo;
  }

  function reiniciarProgreso() {
    var confirmado = window.confirm("Se borrarán tus respuestas y resultados de los 30 ejercicios. ¿Continuar?");
    if (!confirmado) {
      return;
    }
    progreso = { actual: 1, ejercicios: {} };
    guardarProgreso();
    dibujarTodo();
    window.scrollTo({ top: 0 });
  }

  function insertarTabulacion(evento) {
    var area = evento.target;
    var inicio = area.selectionStart;
    var fin = area.selectionEnd;
    var espacios = "    ";
    area.value = area.value.substring(0, inicio) + espacios + area.value.substring(fin);
    area.selectionStart = inicio + espacios.length;
    area.selectionEnd = inicio + espacios.length;
  }

  /* ---------------------------------------------------------------
   * Eventos (delegación sobre contenedores estables)
   * ------------------------------------------------------------- */
  botonReiniciarProgreso.addEventListener("click", reiniciarProgreso);

  elementoContenido.addEventListener("click", function (evento) {
    var boton = evento.target.closest ? evento.target.closest("button") : null;
    if (!boton) {
      return;
    }
    if (boton.id === "botonRevelar") {
      alternarSolucion();
    } else if (boton.id === "botonRestaurar") {
      restaurarCodigoOriginal();
    } else if (boton.id === "botonAnterior") {
      irAlEjercicio(progreso.actual - 1);
    } else if (boton.id === "botonSiguiente") {
      irAlEjercicio(progreso.actual + 1);
    } else if (boton.hasAttribute("data-resultado")) {
      registrarResultado(boton.getAttribute("data-resultado"));
    }
  });

  elementoContenido.addEventListener("input", function (evento) {
    var estado = obtenerEstado(progreso.actual);
    if (evento.target.id === "campoCodigo") {
      estado.codigo = evento.target.value;
      guardarProgreso();
    } else if (evento.target.id === "campoJustificacion") {
      estado.justificacion = evento.target.value;
      guardarProgreso();
    }
  });

  elementoContenido.addEventListener("keydown", function (evento) {
    var esCampoDeCodigo = evento.target.id === "campoCodigo";
    if (esCampoDeCodigo && evento.key === "Tab" && !evento.shiftKey) {
      evento.preventDefault();
      insertarTabulacion(evento);
      var estado = obtenerEstado(progreso.actual);
      estado.codigo = evento.target.value;
      guardarProgreso();
    }
  });

  document.addEventListener("keydown", function (evento) {
    var etiqueta = evento.target && evento.target.tagName ? evento.target.tagName : "";
    var estaEscribiendo = etiqueta === "TEXTAREA" || etiqueta === "INPUT";
    if (estaEscribiendo || evento.altKey || evento.ctrlKey || evento.metaKey) {
      return;
    }
    if (evento.key === "ArrowLeft") {
      irAlEjercicio(progreso.actual - 1);
    } else if (evento.key === "ArrowRight") {
      irAlEjercicio(progreso.actual + 1);
    }
  });

  /* ---------------------------------------------------------------
   * Tema claro / oscuro
   * ------------------------------------------------------------- */
  function temaEfectivo() {
    var explicito = document.documentElement.getAttribute("data-theme");
    if (explicito) {
      return explicito;
    }
    var prefiereOscuro = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefiereOscuro ? "dark" : "light";
  }

  function aplicarTemaGuardado() {
    try {
      var temaGuardado = window.localStorage.getItem(CLAVE_TEMA);
      if (temaGuardado === "light" || temaGuardado === "dark") {
        document.documentElement.setAttribute("data-theme", temaGuardado);
      }
    } catch (error) {
      /* Se usa la preferencia del sistema. */
    }
  }

  botonTema.addEventListener("click", function () {
    var nuevoTema = temaEfectivo() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nuevoTema);
    try {
      window.localStorage.setItem(CLAVE_TEMA, nuevoTema);
    } catch (error) {
      /* Sin almacenamiento: el cambio vale solo para esta visita. */
    }
  });

  /* ---------------------------------------------------------------
   * Arranque
   * ------------------------------------------------------------- */
  function dibujarTodo() {
    dibujarEjercicio();
    actualizarProgresoSuperior();
  }

  aplicarTemaGuardado();
  dibujarTodo();
})();
