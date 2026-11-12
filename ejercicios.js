/*
 * Banco de ejercicios: antipatrones y code smells de persistencia en Android.
 * Dominio: app de notas (ExperimentoPersistencia) con Room, Flow, ViewModel y Compose.
 *
 * Formato de cada ejercicio:
 *  - nivel:    1 a 5 (dificultad creciente)
 *  - codigo:   bloque con antipatrones (lo que el alumno debe corregir)
 *  - smells:   problemas; "linea" es un texto que identifica la línea afectada
 *              ("ocurrencia" = cuál coincidencia usar cuando el texto se repite)
 *  - solucion: versión corregida
 *  - clave:    resumen de una frase para memorizar
 *
 * Convención de texto: {{algo}} se muestra como código en línea.
 */
window.NIVELES = [
  { numero: 1, nombre: "Fundamentos" },
  { numero: 2, nombre: "Intermedio" },
  { numero: 3, nombre: "Avanzado" },
  { numero: 4, nombre: "Experto" },
  { numero: 5, nombre: "Examen final" }
];

window.EJERCICIOS = [
  /* ===================== NIVEL 1 ===================== */
  {
    id: 1,
    nivel: 1,
    tema: "Room · Entity",
    titulo: "La entidad frágil",
    contexto: "Primera versión de la entidad de notas. Funciona en una demo, pero cada decisión va a doler más adelante.",
    codigo: String.raw`@Entity
data class NotaEntity(
    @PrimaryKey var id: Int,
    var titulo: String,
    var contenido: String,
    var importante: Int,
    var creadaEn: String
)`,
    smells: [
      {
        linea: "@Entity",
        titulo: "Nombre de tabla implícito",
        porque: "Sin {{tableName}}, la tabla se llama como la clase ({{NotaEntity}}). Renombrar la clase en un refactor cambiaría el esquema de la base sin que nadie lo note. El nombre de la tabla debe ser explícito y estable."
      },
      {
        linea: "@PrimaryKey var id",
        titulo: "Clave primaria sin autoGenerate",
        porque: "Obliga a inventar los ids a mano. Dos notas con el mismo id hacen fallar el insert (o se pisan con REPLACE). Con {{autoGenerate = true}} y valor por defecto 0, Room delega el id a SQLite."
      },
      {
        linea: "var titulo",
        titulo: "Propiedades var en la entidad",
        porque: "Una entidad mutable se puede modificar desde cualquier lugar sin pasar por la base, y el objeto en memoria queda desincronizado de la fila. Se prefieren {{val}} y {{copy()}} para crear versiones nuevas."
      },
      {
        linea: "importante: Int",
        titulo: "Booleano guardado como Int",
        porque: "Room ya mapea {{Boolean}} a INTEGER (0/1). Usar Int permite valores sin sentido (7, -3) y obliga a comparar con números mágicos en todo el código."
      },
      {
        linea: "creadaEn: String",
        titulo: "Fecha guardada como texto",
        porque: "Un String no se ordena ni se compara por rango de forma confiable (depende del formato y del idioma). Un {{Long}} con epoch millis ordena bien, ocupa menos y se formatea solo al mostrarlo."
      }
    ],
    solucion: String.raw`@Entity(tableName = "notas")
data class NotaEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val titulo: String,
    val contenido: String,
    val importante: Boolean = false,
    val creadaEn: Long = System.currentTimeMillis(),
    val archivada: Boolean = false
)`,
    clave: "Entidad inmutable, tabla con nombre explícito, id autogenerado y tipos que reflejan el dominio (Boolean, Long)."
  },

  {
    id: 2,
    nivel: 1,
    tema: "Room · DAO",
    titulo: "DAO que bloquea el hilo",
    contexto: "Este DAO se usa desde la UI. Al tocar «Guardar» la app se congela o directamente se cierra con una excepción.",
    codigo: String.raw`@Dao
interface NotaDAO {

    @Insert
    fun insertar(nota: NotaEntity): Long

    @Query("SELECT * FROM notas ORDER BY creadaEn DESC")
    fun obtenerTodas(): List<NotaEntity>

    @Delete
    fun eliminar(nota: NotaEntity)
}`,
    smells: [
      {
        linea: "fun insertar",
        titulo: "Operaciones de escritura bloqueantes",
        porque: "Sin {{suspend}}, la función bloquea el hilo que la llama. Si es el hilo principal, Room lanza {{IllegalStateException}} (no permite acceso a disco en Main). Todas las escrituras deben ser {{suspend}}."
      },
      {
        linea: "fun obtenerTodas",
        titulo: "Lectura puntual en lugar de observable",
        porque: "Devuelve una {{List}} una sola vez: la UI no se entera cuando la tabla cambia y hay que volver a consultar a mano. Si la pantalla muestra la lista, el DAO debe devolver {{Flow<List<NotaEntity>>}}."
      }
    ],
    solucion: String.raw`@Dao
interface NotaDAO {

    @Insert
    suspend fun insertar(nota: NotaEntity): Long

    @Query("SELECT * FROM notas ORDER BY creadaEn DESC")
    fun observarNotas(): Flow<List<NotaEntity>>

    @Delete
    suspend fun eliminar(nota: NotaEntity)
}`,
    clave: "Escrituras y lecturas puntuales: suspend. Lecturas que alimentan la UI: Flow (y esa función no es suspend)."
  },

  {
    id: 3,
    nivel: 1,
    tema: "Room · Base de datos",
    titulo: "Base de datos en la Activity",
    contexto: "Alguien resolvió «rápido» cómo mostrar las notas en pantalla.",
    codigo: String.raw`class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val db = Room.databaseBuilder(this, AppDatabase::class.java, "notas-db")
            .allowMainThreadQueries()
            .build()

        val notas = db.notaDao().obtenerTodas()

        setContent {
            ListaNotas(notas)
        }
    }
}`,
    smells: [
      {
        linea: "Room.databaseBuilder(this",
        titulo: "La Activity crea y posee la base",
        porque: "Cada recreación de la Activity (rotación) construye otra instancia de la base. Además se le pasa la Activity como Context, con riesgo de fuga de memoria. La base debe ser única y vivir a nivel de aplicación."
      },
      {
        linea: ".allowMainThreadQueries()",
        titulo: "allowMainThreadQueries",
        porque: "Apaga la protección de Room y permite consultas en el hilo principal. Con tablas grandes produce jank o un ANR. Es un parche que esconde el problema real."
      },
      {
        linea: "db.notaDao().obtenerTodas()",
        titulo: "Consulta síncrona en onCreate",
        porque: "Bloquea el arranque de la pantalla y entrega una foto estática de los datos: si se agrega una nota, la lista no cambia. Se debe observar un Flow desde un ViewModel."
      }
    ],
    solucion: String.raw`// La base vive en la Application (una sola instancia para toda la app)
class NotasApplication : Application() {
    val baseDeDatos: AppDatabase by lazy {
        Room.databaseBuilder(this, AppDatabase::class.java, "notas-db").build()
    }
}

// El ViewModel expone los datos como estado observable
class NotaViewModel(dao: NotaDAO) : ViewModel() {
    val notas: StateFlow<List<NotaEntity>> = dao.observarNotas()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList()
        )
}

// La Activity solo arma la UI; la pantalla consume el ViewModel
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PantallaNota()
        }
    }
}

// En la pantalla:
// val notas by viewModel.notas.collectAsStateWithLifecycle()`,
    clave: "Una base única en Application, acceso desde ViewModel, jamás consultas en el hilo principal."
  },

  {
    id: 4,
    nivel: 1,
    tema: "Room · Consultas",
    titulo: "Filtrar a mano",
    contexto: "Se necesita la lista de notas importantes. El DAO ya tiene una columna {{importante}}.",
    codigo: String.raw`suspend fun cargarImportantes(): List<NotaEntity> {
    val todas = dao.obtenerTodasUnaVez()
    val importantes = mutableListOf<NotaEntity>()

    for (nota in todas) {
        if (nota.importante == true) {
            importantes.add(nota)
        }
    }

    return importantes
}`,
    smells: [
      {
        linea: "dao.obtenerTodasUnaVez()",
        titulo: "Traer todo para filtrar en memoria",
        porque: "Se leen todas las filas de disco y se descartan la mayoría. La base de datos existe justamente para filtrar: una consulta con {{WHERE importante = 1}} lee solo lo necesario."
      },
      {
        linea: "mutableListOf<NotaEntity>()",
        titulo: "Bucle manual en vez de consulta",
        porque: "Más código, más estado mutable y más chances de error para reimplementar lo que SQL hace en una línea."
      },
      {
        linea: "== true",
        titulo: "Comparación redundante",
        porque: "{{nota.importante}} ya es un {{Boolean}}. Compararlo con {{true}} es ruido que revela poca familiaridad con el tipo."
      }
    ],
    solucion: String.raw`// En el DAO
@Query("SELECT * FROM notas WHERE importante = 1")
suspend fun obtenerImportantes(): List<NotaEntity>

// En el repositorio
suspend fun cargarImportantes(): List<NotaEntity> {
    return dao.obtenerImportantes()
}`,
    clave: "El filtrado y el ordenamiento se hacen en SQL, no en Kotlin."
  },

  {
    id: 5,
    nivel: 1,
    tema: "Room · Consultas",
    titulo: "Borrar de a una",
    contexto: "El botón «Vaciar» elimina todas las notas del usuario.",
    codigo: String.raw`fun borrarTodas() {
    viewModelScope.launch {
        val notas = dao.obtenerTodasUnaVez()

        for (nota in notas) {
            dao.eliminar(nota)
        }
    }
}`,
    smells: [
      {
        linea: "obtenerTodasUnaVez",
        titulo: "Leer todo solo para borrar",
        porque: "Se cargan todas las notas en memoria únicamente para recorrerlas y eliminarlas. No se necesita ningún dato de ellas."
      },
      {
        linea: "dao.eliminar(nota)",
        titulo: "N operaciones y sin atomicidad",
        porque: "Son N sentencias DELETE separadas. Si la app muere a la mitad, quedan notas a medio borrar. Un solo {{DELETE FROM notas}} es más rápido y atómico."
      }
    ],
    solucion: String.raw`// En el DAO
@Query("DELETE FROM notas")
suspend fun borrarTodas()

// En el ViewModel
fun borrarTodas() {
    viewModelScope.launch {
        dao.borrarTodas()
    }
}`,
    clave: "Operaciones masivas: una sola sentencia SQL, no un bucle de operaciones individuales."
  },

  {
    id: 6,
    nivel: 1,
    tema: "Room · Update",
    titulo: "Actualizar borrando",
    contexto: "Se marca una nota como importante.",
    codigo: String.raw`suspend fun marcarImportante(nota: NotaEntity) {
    dao.eliminar(nota)

    val notaNueva = NotaEntity(
        id = nota.id,
        titulo = nota.titulo,
        contenido = nota.contenido,
        importante = true,
        creadaEn = nota.creadaEn,
        archivada = nota.archivada
    )

    dao.insertar(notaNueva)
}`,
    smells: [
      {
        linea: "dao.eliminar(nota)",
        titulo: "Delete + insert en lugar de update",
        porque: "Si falla entre las dos operaciones, la nota se pierde. Además, quienes observan la tabla reciben dos emisiones (primero sin la nota, después con ella) y la UI parpadea. Para eso existe {{@Update}}."
      },
      {
        linea: "val notaNueva = NotaEntity(",
        titulo: "Copia manual campo por campo",
        porque: "Si mañana se agrega una columna y se olvida copiarla, se pierde el dato en silencio. {{copy()}} de la data class mantiene todo y cambia solo lo pedido."
      }
    ],
    solucion: String.raw`// En el DAO
@Update
suspend fun actualizar(nota: NotaEntity)

// En el repositorio
suspend fun marcarImportante(nota: NotaEntity) {
    val notaActualizada = nota.copy(importante = true)
    dao.actualizar(notaActualizada)
}`,
    clave: "@Update + copy(): una sola operación, atómica, sin copiar campos a mano."
  },

  /* ===================== NIVEL 2 ===================== */
  {
    id: 7,
    nivel: 2,
    tema: "Room · Singleton",
    titulo: "El singleton con carrera",
    contexto: "Patrón clásico copiado de un tutorial viejo. Se llama desde varios hilos al arrancar.",
    codigo: String.raw`@Database(entities = [NotaEntity::class], version = 1)
abstract class AppDatabase : RoomDatabase() {
    abstract fun notaDao(): NotaDAO

    companion object {
        var instancia: AppDatabase? = null

        fun obtener(contexto: Context): AppDatabase {
            if (instancia == null) {
                instancia = Room.databaseBuilder(contexto, AppDatabase::class.java, "notas-db").build()
            }
            return instancia!!
        }
    }
}`,
    smells: [
      {
        linea: "var instancia",
        titulo: "Campo público y mutable",
        porque: "Cualquiera puede reasignar o poner en null la instancia. Debe ser {{private}} y {{@Volatile}} para que los cambios sean visibles entre hilos."
      },
      {
        linea: "if (instancia == null)",
        titulo: "Condición de carrera (check-then-act)",
        porque: "Dos hilos pueden ver {{null}} al mismo tiempo y crear dos bases distintas sobre el mismo archivo. Hace falta {{synchronized}} con doble verificación."
      },
      {
        linea: "Room.databaseBuilder(contexto",
        titulo: "Context sin applicationContext",
        porque: "Si llega una Activity, el singleton (que vive tanto como el proceso) la retiene y causa una fuga de memoria. Siempre {{contexto.applicationContext}}."
      },
      {
        linea: "instancia!!",
        titulo: "Operador !! para silenciar el compilador",
        porque: "Oculta que el diseño no garantiza el valor. Con una variable local no nula, el compilador lo demuestra sin necesidad de {{!!}}."
      }
    ],
    solucion: String.raw`@Database(entities = [NotaEntity::class], version = 1)
abstract class AppDatabase : RoomDatabase() {
    abstract fun notaDao(): NotaDAO

    companion object {
        @Volatile
        private var instancia: AppDatabase? = null

        fun obtener(contexto: Context): AppDatabase {
            val instanciaExistente = instancia
            if (instanciaExistente != null) {
                return instanciaExistente
            }

            return synchronized(this) {
                val instanciaDentroDelLock = instancia
                if (instanciaDentroDelLock != null) {
                    instanciaDentroDelLock
                } else {
                    val nuevaInstancia = Room.databaseBuilder(
                        contexto.applicationContext,
                        AppDatabase::class.java,
                        "notas-db"
                    ).build()
                    instancia = nuevaInstancia
                    nuevaInstancia
                }
            }
        }
    }
}`,
    clave: "Singleton seguro: @Volatile + synchronized con doble verificación + applicationContext. (Con DI como Hilt se resuelve con @Singleton.)"
  },

  {
    id: 8,
    nivel: 2,
    tema: "Room · Flow",
    titulo: "Refresco manual",
    contexto: "La lista de notas en pantalla a veces queda desactualizada después de guardar o eliminar.",
    codigo: String.raw`class NotaViewModel(private val dao: NotaDAO) : ViewModel() {

    var notas by mutableStateOf<List<NotaEntity>>(emptyList())
        private set

    init {
        cargarNotas()
    }

    fun cargarNotas() {
        viewModelScope.launch {
            notas = dao.obtenerTodasUnaVez()
        }
    }

    fun guardar(nota: NotaEntity) {
        viewModelScope.launch {
            dao.insertar(nota)
            cargarNotas()
        }
    }

    fun eliminar(nota: NotaEntity) {
        viewModelScope.launch {
            dao.eliminar(nota)
            cargarNotas()
        }
    }
}`,
    smells: [
      {
        linea: "mutableStateOf",
        titulo: "ViewModel acoplado al runtime de Compose",
        porque: "{{mutableStateOf}} es de Compose. Un ViewModel no debería depender de la capa de UI. Se expone un {{StateFlow}}, que funciona con cualquier interfaz y es fácil de testear."
      },
      {
        linea: "dao.obtenerTodasUnaVez",
        titulo: "Consulta puntual para datos vivos",
        porque: "Los datos se vuelven viejos apenas cambia la tabla. Room puede avisar los cambios solo con {{Flow}}."
      },
      {
        linea: "cargarNotas()",
        ocurrencia: 3,
        titulo: "Refresco manual tras cada mutación",
        porque: "Cada nueva operación de escritura exige recordar recargar. Si se olvida una, la UI queda desactualizada. Hay dos fuentes de verdad (la base y la variable) que se sincronizan a mano."
      }
    ],
    solucion: String.raw`class NotaViewModel(private val dao: NotaDAO) : ViewModel() {

    // La base de datos es la única fuente de verdad: la lista se actualiza sola
    val notas: StateFlow<List<NotaEntity>> = dao.observarNotas()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList()
        )

    fun guardar(nota: NotaEntity) {
        viewModelScope.launch {
            dao.insertar(nota)
        }
    }

    fun eliminar(nota: NotaEntity) {
        viewModelScope.launch {
            dao.eliminar(nota)
        }
    }
}`,
    clave: "Single source of truth: DAO devuelve Flow, el ViewModel lo transforma en StateFlow y las escrituras no refrescan nada."
  },

  {
    id: 9,
    nivel: 2,
    tema: "Corrutinas · ViewModel",
    titulo: "GlobalScope en el ViewModel",
    contexto: "El botón «Guardar» persiste una nota nueva.",
    codigo: String.raw`class NotaViewModel(private val dao: NotaDAO) : ViewModel() {

    fun guardar(titulo: String, contenido: String) {
        GlobalScope.launch {
            val nota = NotaEntity(
                titulo = titulo,
                contenido = contenido
            )
            dao.insertar(nota)
        }
    }
}`,
    smells: [
      {
        linea: "fun guardar",
        titulo: "Sin validación de entrada",
        porque: "Se pueden guardar notas con título vacío o solo espacios. Las reglas de negocio mínimas se validan antes de tocar la base."
      },
      {
        linea: "GlobalScope.launch",
        titulo: "GlobalScope",
        porque: "No está atado a ningún ciclo de vida: vive hasta que termina o muere el proceso, y se filtra aunque el ViewModel haya sido destruido. Se usa {{viewModelScope}}, que se cancela solo en {{onCleared}}."
      },
      {
        linea: "dao.insertar(nota)",
        titulo: "Sin manejo de errores ni estado de guardado",
        porque: "Si el insert falla, la excepción tumba la app y el usuario nunca ve «Guardando…» ni un mensaje de error. Hace falta exponer {{guardando}} y {{error}} en el estado de UI."
      }
    ],
    solucion: String.raw`class NotaViewModel(private val dao: NotaDAO) : ViewModel() {

    private val _estado = MutableStateFlow(NotaUiState())
    val estado: StateFlow<NotaUiState> = _estado.asStateFlow()

    fun guardar(titulo: String, contenido: String) {
        if (titulo.isBlank()) {
            _estado.update { estadoActual ->
                estadoActual.copy(error = "El título no puede estar vacío")
            }
            return
        }

        viewModelScope.launch {
            _estado.update { estadoActual ->
                estadoActual.copy(guardando = true, error = null)
            }
            try {
                val nota = NotaEntity(titulo = titulo.trim(), contenido = contenido)
                dao.insertar(nota)
                _estado.value = NotaUiState()
            } catch (cancelacion: CancellationException) {
                throw cancelacion
            } catch (excepcion: Exception) {
                _estado.update { estadoActual ->
                    estadoActual.copy(guardando = false, error = "No se pudo guardar la nota")
                }
            }
        }
    }
}`,
    clave: "viewModelScope + validación + estado guardando/error + relanzar CancellationException."
  },

  {
    id: 10,
    nivel: 2,
    tema: "Estado · UiState",
    titulo: "Estado que cualquiera escribe",
    contexto: "El proyecto ya define {{NotaUiState}} y {{NotaEvento}}, pero esta pantalla los usa mal.",
    codigo: String.raw`class NotaViewModel : ViewModel() {
    val estado = MutableStateFlow(NotaUiState())
}

@Composable
fun PantallaNota(viewModel: NotaViewModel) {
    val estado by viewModel.estado.collectAsState()

    OutlinedTextField(
        value = estado.titulo,
        onValueChange = { texto ->
            viewModel.estado.value = estado.copy(titulo = texto)
        }
    )

    Button(onClick = {
        viewModel.estado.value = estado.copy(guardando = true)
    }) {
        Text("Guardar")
    }
}`,
    smells: [
      {
        linea: "val estado = MutableStateFlow",
        titulo: "MutableStateFlow público",
        porque: "Rompe el encapsulamiento: cualquier clase puede modificar el estado. El patrón es un {{_estado}} privado mutable y un {{estado}} público de solo lectura con {{asStateFlow()}}."
      },
      {
        linea: "viewModel.estado.value = estado.copy(titulo",
        titulo: "La UI escribe el estado directamente",
        porque: "La lógica se escapa del ViewModel y no hay un único punto de entrada. Además {{estado.copy}} usa una foto vieja: dos cambios seguidos pueden pisarse. La UI debe enviar eventos ({{NotaEvento}}) y el ViewModel decide."
      },
      {
        linea: "collectAsState()",
        titulo: "Colección que ignora el ciclo de vida",
        porque: "{{collectAsState}} sigue recolectando con la app en segundo plano. {{collectAsStateWithLifecycle}} se detiene cuando la pantalla no es visible."
      }
    ],
    solucion: String.raw`class NotaViewModel : ViewModel() {

    private val _estado = MutableStateFlow(NotaUiState())
    val estado: StateFlow<NotaUiState> = _estado.asStateFlow()

    fun onEvento(evento: NotaEvento) {
        when (evento) {
            is NotaEvento.TituloCambiado -> {
                _estado.update { actual ->
                    actual.copy(titulo = evento.texto, error = null)
                }
            }
            is NotaEvento.ContenidoCambiado -> {
                _estado.update { actual ->
                    actual.copy(contenido = evento.texto, error = null)
                }
            }
            NotaEvento.GuardarPulsado -> guardar()
        }
    }

    private fun guardar() { /* validar y persistir */ }
}

@Composable
fun PantallaNota(viewModel: NotaViewModel) {
    val estado by viewModel.estado.collectAsStateWithLifecycle()

    OutlinedTextField(
        value = estado.titulo,
        onValueChange = { texto ->
            viewModel.onEvento(NotaEvento.TituloCambiado(texto))
        }
    )

    Button(onClick = { viewModel.onEvento(NotaEvento.GuardarPulsado) }) {
        Text("Guardar")
    }
}`,
    clave: "Flujo de datos unidireccional: estado hacia abajo (StateFlow de solo lectura), eventos hacia arriba (onEvento)."
  },

  {
    id: 11,
    nivel: 2,
    tema: "Compose · Estado",
    titulo: "La pantalla del proyecto",
    contexto: "Este es el estado actual de {{PantallaNota}} en ExperimentoPersistencia. Rota el teléfono y la nota se pierde; toca «Guardar» y el botón queda en «Guardando…» para siempre.",
    codigo: String.raw`@Composable
fun PantallaNota(modifier: Modifier = Modifier) {
    var estado by remember { mutableStateOf(NotaUiState()) }

    Column(modifier = modifier.padding(16.dp)) {
        OutlinedTextField(
            value = estado.titulo,
            onValueChange = { estado = estado.copy(titulo = it, error = null) },
            label = { Text("Titulo") }
        )
        OutlinedTextField(
            value = estado.contenido,
            onValueChange = { estado = estado.copy(contenido = it, error = null) },
            label = { Text("Contenido") }
        )
        estado.error?.let { Text(it) }
        Button(
            onClick = { estado = estado.copy(guardando = true) },
            enabled = !estado.guardando
        ) {
            Text(if (estado.guardando) "Guardando..." else "Guardar")
        }
    }
}`,
    smells: [
      {
        linea: "remember { mutableStateOf",
        titulo: "Estado con remember",
        porque: "{{remember}} sobrevive a recomposiciones, pero no a la rotación: la Activity se recrea y el estado se pierde. El estado de pantalla vive en un ViewModel (o al menos {{rememberSaveable}})."
      },
      {
        linea: "onValueChange = { estado = estado.copy(titulo",
        titulo: "Lógica de estado dentro del Composable",
        porque: "El Composable decide cómo cambia el estado. Es difícil de testear y mezcla presentación con lógica. Debe emitir {{NotaEvento.TituloCambiado}} y que lo procese el ViewModel."
      },
      {
        linea: "onClick = { estado = estado.copy(guardando = true) }",
        titulo: "El botón nunca persiste ni termina",
        porque: "Solo pone {{guardando = true}}. Nadie llama al DAO ni vuelve a ponerlo en {{false}}: la pantalla queda bloqueada. Guardar es una acción del ViewModel que termina en éxito o error."
      }
    ],
    solucion: String.raw`// Composable con estado: conecta el ViewModel
@Composable
fun PantallaNota(
    viewModel: NotaViewModel,
    modifier: Modifier = Modifier
) {
    val estado by viewModel.estado.collectAsStateWithLifecycle()

    ContenidoNota(
        estado = estado,
        onEvento = viewModel::onEvento,
        modifier = modifier
    )
}

// Composable sin estado: solo dibuja y emite eventos
@Composable
fun ContenidoNota(
    estado: NotaUiState,
    onEvento: (NotaEvento) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.padding(16.dp)) {
        OutlinedTextField(
            value = estado.titulo,
            onValueChange = { texto -> onEvento(NotaEvento.TituloCambiado(texto)) },
            label = { Text("Título") }
        )
        OutlinedTextField(
            value = estado.contenido,
            onValueChange = { texto -> onEvento(NotaEvento.ContenidoCambiado(texto)) },
            label = { Text("Contenido") }
        )
        if (estado.error != null) {
            Text(text = estado.error)
        }
        Button(
            onClick = { onEvento(NotaEvento.GuardarPulsado) },
            enabled = !estado.guardando
        ) {
            Text(if (estado.guardando) "Guardando..." else "Guardar")
        }
    }
}`,
    clave: "State hoisting: Composable con estado (ViewModel) + Composable sin estado (estado y eventos). El ViewModel persiste y cierra el ciclo guardando."
  },

  {
    id: 12,
    nivel: 2,
    tema: "SharedPreferences · DataStore",
    titulo: "Preferencias como base de datos",
    contexto: "Clase que guarda y lee la lista de notas del usuario. Con cero notas la pantalla muestra una nota vacía.",
    codigo: String.raw`class NotasPrefs(contexto: Context) {

    private val prefs = contexto.getSharedPreferences("notas", Context.MODE_PRIVATE)

    fun guardarNotas(notas: List<String>) {
        prefs.edit()
            .putString("lista", notas.joinToString(","))
            .commit()
    }

    fun leerNotas(): List<String> {
        val texto = prefs.getString("lista", "")!!
        return texto.split(",")
    }
}`,
    smells: [
      {
        linea: "joinToString",
        titulo: "Datos estructurados serializados con un separador",
        porque: "Si una nota contiene una coma, se rompe en dos. Los datos con estructura, que crecen o se consultan, van en una base de datos (Room), no en clave-valor."
      },
      {
        linea: ".commit()",
        titulo: "commit() escribe en disco de forma síncrona",
        porque: "Bloquea el hilo que lo llama. {{apply()}} es asíncrono, pero lo moderno para preferencias es DataStore, que es asíncrono y transaccional."
      },
      {
        linea: "!!",
        titulo: "Operador !! sobre un valor externo",
        porque: "{{getString}} puede devolver {{null}}. Se usa un valor por defecto o se maneja el caso en vez de forzar con {{!!}}."
      },
      {
        linea: "texto.split",
        titulo: "Bug: lista vacía devuelve un elemento",
        porque: "{{\"\".split(\",\")}} devuelve {{[\"\"]}}, una lista con un String vacío. Con cero notas, la app muestra una nota fantasma."
      }
    ],
    solucion: String.raw`// Las notas viven en Room (NotaEntity + NotaDAO).
// DataStore queda solo para preferencias simples del usuario.

private val Context.dataStore by preferencesDataStore(name = "ajustes")

class AjustesRepository(private val contexto: Context) {

    private val claveOrdenarPorFecha = booleanPreferencesKey("ordenar_por_fecha")

    val ordenarPorFecha: Flow<Boolean> = contexto.dataStore.data
        .map { preferencias ->
            preferencias[claveOrdenarPorFecha] ?: true
        }

    suspend fun guardarOrdenarPorFecha(valor: Boolean) {
        contexto.dataStore.edit { preferencias ->
            preferencias[claveOrdenarPorFecha] = valor
        }
    }
}`,
    clave: "Datos estructurados = Room. Preferencias simples = DataStore (Flow + suspend). SharedPreferences, nunca para listas."
  },

  /* ===================== NIVEL 3 ===================== */
  {
    id: 13,
    nivel: 3,
    tema: "Room · Conflictos",
    titulo: "El duplicado que mata la app",
    contexto: "La tabla tiene un índice único sobre {{titulo}}. Al guardar dos notas con el mismo título, la app se cierra.",
    codigo: String.raw`@Entity(
    tableName = "notas",
    indices = [Index(value = ["titulo"], unique = true)]
)
data class NotaEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val titulo: String,
    val contenido: String
)

@Dao
interface NotaDAO {
    @Insert
    suspend fun insertar(nota: NotaEntity): Long
}

fun guardar(titulo: String) {
    viewModelScope.launch {
        dao.insertar(NotaEntity(titulo = titulo, contenido = ""))
    }
}`,
    smells: [
      {
        linea: "@Insert",
        titulo: "Estrategia de conflicto por defecto",
        porque: "Por defecto es {{ABORT}}: ante un duplicado lanza {{SQLiteConstraintException}}. Hay que elegir una estrategia a propósito: {{IGNORE}} (no insertar) o {{REPLACE}} (cuidado: borra y vuelve a insertar la fila, cambia el id y dispara cascadas)."
      },
      {
        linea: "viewModelScope.launch",
        titulo: "Excepción sin capturar en la corrutina",
        porque: "Una excepción no manejada en {{viewModelScope}} termina la app. El error esperable (duplicado) tiene que traducirse en un mensaje para el usuario."
      },
      {
        linea: "dao.insertar(NotaEntity(",
        titulo: "Se ignora el valor de retorno del insert",
        porque: "{{insertar}} devuelve el id generado, o {{-1}} cuando {{IGNORE}} descartó la fila. Ignorarlo impide saber si realmente se guardó."
      }
    ],
    solucion: String.raw`@Dao
interface NotaDAO {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertar(nota: NotaEntity): Long
}

fun guardar(titulo: String) {
    viewModelScope.launch {
        val idInsertado = dao.insertar(NotaEntity(titulo = titulo, contenido = ""))

        if (idInsertado == -1L) {
            _estado.update { estadoActual ->
                estadoActual.copy(error = "Ya existe una nota con ese título")
            }
        }
    }
}`,
    clave: "Elegir onConflict a propósito, mirar el Long que devuelve el insert (-1 = ignorado) y traducirlo a estado de UI."
  },

  {
    id: 14,
    nivel: 3,
    tema: "Room · Transacciones",
    titulo: "Dos escrituras, cero atomicidad",
    contexto: "Al archivar una nota también se registra la acción en una tabla de historial.",
    codigo: String.raw`class NotaRepository(
    private val dao: NotaDAO,
    private val historialDao: HistorialDAO
) {
    suspend fun archivarNota(nota: NotaEntity) {
        dao.actualizar(nota.copy(archivada = true))

        historialDao.insertar(
            HistorialEntity(
                notaId = nota.id,
                accion = "ARCHIVADA",
                fecha = System.currentTimeMillis()
            )
        )
    }
}`,
    smells: [
      {
        linea: "dao.actualizar",
        titulo: "Escrituras relacionadas sin transacción",
        porque: "Si la app falla entre las dos operaciones, la nota queda archivada sin historial (datos inconsistentes). Además, quienes observan la tabla ven un estado intermedio. Ambas deben ejecutarse en una sola transacción."
      },
      {
        linea: "System.currentTimeMillis()",
        titulo: "Reloj fijo dentro de la lógica",
        porque: "Imposible de controlar en un test. Se inyecta una fuente de tiempo (por ejemplo una interfaz {{Reloj}} o {{Clock}}) y se prueba con una hora conocida."
      }
    ],
    solucion: String.raw`class NotaRepository(
    private val baseDeDatos: AppDatabase,
    private val reloj: Reloj
) {
    suspend fun archivarNota(nota: NotaEntity) {
        // withTransaction: o se hacen las dos escrituras, o ninguna
        baseDeDatos.withTransaction {
            baseDeDatos.notaDao().actualizar(nota.copy(archivada = true))

            baseDeDatos.historialDao().insertar(
                HistorialEntity(
                    notaId = nota.id,
                    accion = "ARCHIVADA",
                    fecha = reloj.ahora()
                )
            )
        }
    }
}

// Alternativa: una función @Transaction dentro de un DAO abstracto`,
    clave: "Varias escrituras que deben ir juntas = una transacción (withTransaction o @Transaction)."
  },

  {
    id: 15,
    nivel: 3,
    tema: "Room · Migraciones",
    titulo: "La migración destructiva",
    contexto: "En la versión 1 la tabla no tenía la columna {{archivada}}. En la versión 2 se agregó y la app ya está publicada.",
    codigo: String.raw`@Database(
    entities = [NotaEntity::class],
    version = 2,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun notaDao(): NotaDAO
}

val baseDeDatos = Room.databaseBuilder(contexto, AppDatabase::class.java, "notas-db")
    .fallbackToDestructiveMigration()
    .build()`,
    smells: [
      {
        linea: "version = 2",
        titulo: "Versión subida sin Migration",
        porque: "Cambiar el esquema obliga a decirle a Room cómo pasar de la versión 1 a la 2. Sin una {{Migration}}, Room no puede actualizar la base existente."
      },
      {
        linea: "exportSchema = false",
        titulo: "No se exporta el esquema",
        porque: "Sin el JSON del esquema no se puede versionar ni testear migraciones ({{MigrationTestHelper}}). Se activa y se configura {{room.schemaLocation}} en Gradle."
      },
      {
        linea: ".fallbackToDestructiveMigration()",
        titulo: "fallbackToDestructiveMigration en producción",
        porque: "Ante una migración que falta, borra toda la base. En una app publicada eso significa perder todas las notas de todos los usuarios al actualizar."
      }
    ],
    solucion: String.raw`@Database(
    entities = [NotaEntity::class],
    version = 2,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun notaDao(): NotaDAO
}

// build.gradle.kts:
// ksp { arg("room.schemaLocation", "$projectDir/schemas") }

val MIGRACION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "ALTER TABLE notas ADD COLUMN archivada INTEGER NOT NULL DEFAULT 0"
        )
    }
}

val baseDeDatos = Room.databaseBuilder(contexto, AppDatabase::class.java, "notas-db")
    .addMigrations(MIGRACION_1_2)
    .build()`,
    clave: "Cada cambio de esquema = una Migration explícita + esquema exportado + test de migración. Destructive solo en desarrollo."
  },

  {
    id: 16,
    nivel: 3,
    tema: "Repositorio · Errores",
    titulo: "El repositorio que se traga todo",
    contexto: "Capa de datos que «nunca falla». El problema es que tampoco avisa.",
    codigo: String.raw`class NotaRepository(private val dao: NotaDAO) {

    suspend fun obtenerNota(id: Int): NotaEntity? {
        return withContext(Dispatchers.IO) {
            try {
                dao.obtenerNotaPorId(id)
            } catch (e: Exception) {
                e.printStackTrace()
                null
            }
        }
    }
}`,
    smells: [
      {
        linea: "withContext(Dispatchers.IO)",
        titulo: "Dispatcher innecesario y fijo",
        porque: "Las funciones {{suspend}} de Room ya son seguras para el hilo principal (usan su propio executor). Cambiar de dispatcher no aporta nada y, al estar escrito a mano, dificulta los tests."
      },
      {
        linea: "catch (e: Exception)",
        titulo: "Captura genérica que traga CancellationException",
        porque: "{{CancellationException}} es una excepción y el catch la atrapa: la corrutina no se cancela de verdad y se rompe la cancelación cooperativa. Hay que relanzarla."
      },
      {
        linea: "e.printStackTrace()",
        titulo: "printStackTrace en lugar de logging",
        porque: "No hay nivel, etiqueta ni integración con herramientas de monitoreo. Se usa {{Log}} o la librería de logging del proyecto."
      },
      {
        linea: "null",
        titulo: "Null como resultado de error",
        porque: "{{null}} significa a la vez «la nota no existe» y «se rompió la base». El llamador no puede distinguirlos. Un resultado tipado ({{sealed interface}}) los separa."
      }
    ],
    solucion: String.raw`sealed interface ResultadoNota {
    data class Encontrada(val nota: NotaEntity) : ResultadoNota
    data object NoExiste : ResultadoNota
    data class Error(val mensaje: String) : ResultadoNota
}

class NotaRepository(private val dao: NotaDAO) {

    suspend fun obtenerNota(id: Int): ResultadoNota {
        try {
            val nota = dao.obtenerNotaPorId(id)
            if (nota == null) {
                return ResultadoNota.NoExiste
            }
            return ResultadoNota.Encontrada(nota)
        } catch (cancelacion: CancellationException) {
            throw cancelacion
        } catch (excepcion: Exception) {
            Log.e("NotaRepository", "Error leyendo la nota $id", excepcion)
            return ResultadoNota.Error("No se pudo leer la nota")
        }
    }
}`,
    clave: "No cambiar de dispatcher sobre Room, relanzar CancellationException y modelar éxito, ausencia y error con tipos distintos."
  },

  {
    id: 17,
    nivel: 3,
    tema: "Room · Seguridad",
    titulo: "SQL armado con texto",
    contexto: "Buscador de notas por título. Funciona hasta que alguien busca {{O'Brien}}.",
    codigo: String.raw`@Dao
interface NotaDAO {
    @RawQuery
    suspend fun buscarRaw(consulta: SupportSQLiteQuery): List<NotaEntity>
}

suspend fun buscar(texto: String): List<NotaEntity> {
    val sql = "SELECT * FROM notas WHERE titulo LIKE '%" + texto + "%'"
    return dao.buscarRaw(SimpleSQLiteQuery(sql))
}`,
    smells: [
      {
        linea: "val sql =",
        titulo: "Concatenación de entrada en la consulta (SQL injection)",
        porque: "El texto del usuario se mezcla con el SQL. Un apóstrofe rompe la consulta y con un valor malicioso se altera su significado. Los valores siempre viajan como parámetros enlazados ({{:texto}})."
      },
      {
        linea: "@RawQuery",
        titulo: "@RawQuery cuando una consulta estática alcanza",
        porque: "{{@RawQuery}} no se valida en tiempo de compilación. Con {{@Query}} Room revisa el SQL al compilar y enlaza los parámetros de forma segura."
      }
    ],
    solucion: String.raw`@Dao
interface NotaDAO {
    @Query("SELECT * FROM notas WHERE titulo LIKE '%' || :texto || '%'")
    fun buscar(texto: String): Flow<List<NotaEntity>>
}

// En el repositorio / ViewModel:
// dao.buscar(texto)   // el parámetro viaja enlazado, nunca concatenado`,
    clave: "Nunca concatenar entrada en SQL: @Query con parámetros enlazados (:param). RawQuery solo si la consulta es realmente dinámica."
  },

  {
    id: 18,
    nivel: 3,
    tema: "Flow · Ciclo de vida",
    titulo: "El Flow que nunca descansa",
    contexto: "La lista de notas se actualiza bien, pero la app consume batería en segundo plano y al abrir muestra un instante «sin notas».",
    codigo: String.raw`class NotaViewModel(dao: NotaDAO) : ViewModel() {
    val notas: StateFlow<List<NotaEntity>> = dao.observarNotas()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = emptyList()
        )
}

@Composable
fun ListaNotas(viewModel: NotaViewModel) {
    var notas by remember { mutableStateOf<List<NotaEntity>>(emptyList()) }

    LaunchedEffect(Unit) {
        viewModel.notas.collect { listaNueva ->
            notas = listaNueva
        }
    }
}`,
    smells: [
      {
        linea: "SharingStarted.Eagerly",
        titulo: "Flow caliente permanente",
        porque: "{{Eagerly}} mantiene la consulta observando la base mientras viva el ViewModel, haya o no pantalla. {{WhileSubscribed(5_000)}} la pausa 5 segundos después de que no hay nadie mirando (sobrevive a la rotación)."
      },
      {
        linea: "initialValue = emptyList()",
        titulo: "Lista vacía como estado inicial",
        porque: "«Todavía cargando» y «no hay notas» se ven iguales: el usuario ve por un instante un falso estado vacío. Se modela con un estado {{Cargando}} (ver ejercicio 29)."
      },
      {
        linea: "LaunchedEffect(Unit)",
        titulo: "Colección manual dentro del Composable",
        porque: "Se reimplementa a mano algo que ya existe y, encima, no respeta el ciclo de vida: sigue recolectando en segundo plano. {{collectAsStateWithLifecycle()}} lo resuelve en una línea."
      }
    ],
    solucion: String.raw`class NotaViewModel(dao: NotaDAO) : ViewModel() {
    val notas: StateFlow<List<NotaEntity>> = dao.observarNotas()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList()
        )
}

@Composable
fun ListaNotas(viewModel: NotaViewModel) {
    val notas by viewModel.notas.collectAsStateWithLifecycle()
    // ...
}`,
    clave: "stateIn con WhileSubscribed(5_000) + collectAsStateWithLifecycle: se observa solo cuando la pantalla está visible."
  },

  /* ===================== NIVEL 4 ===================== */
  {
    id: 19,
    nivel: 4,
    tema: "Room · Rendimiento",
    titulo: "Traer 20.000 notas para mostrar títulos",
    contexto: "La pantalla de lista solo muestra título y fecha de las notas importantes. La tabla tiene 20.000 filas y {{contenido}} puede pesar varios KB.",
    codigo: String.raw`@Entity(tableName = "notas")
data class NotaEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val titulo: String,
    val contenido: String,
    val importante: Boolean,
    val creadaEn: Long
)

@Query("SELECT * FROM notas WHERE importante = 1 ORDER BY creadaEn DESC")
fun observarImportantes(): Flow<List<NotaEntity>>`,
    smells: [
      {
        linea: "SELECT * FROM notas",
        titulo: "SELECT * para una pantalla que usa tres columnas",
        porque: "Lee y copia a memoria el {{contenido}} de cada nota sin necesitarlo. Con textos grandes aumenta el uso de memoria y puede chocar con el límite de la ventana del cursor. Se hace una proyección."
      },
      {
        linea: "@Entity(tableName",
        titulo: "Sin índice para el filtro y el orden",
        porque: "Filtrar por {{importante}} y ordenar por {{creadaEn}} sin índice obliga a recorrer toda la tabla y ordenarla en cada consulta. Un índice compuesto ({{importante}}, {{creadaEn}}) sirve para ambas cosas."
      },
      {
        linea: "val contenido: String",
        titulo: "Devolver la entidad completa a la UI",
        porque: "Se expone un modelo de persistencia donde la pantalla solo necesita un resumen. Un tipo propio ({{NotaResumen}}) deja explícito qué datos consume la UI."
      }
    ],
    solucion: String.raw`@Entity(
    tableName = "notas",
    indices = [Index(value = ["importante", "creadaEn"])]
)
data class NotaEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val titulo: String,
    val contenido: String,
    val importante: Boolean,
    val creadaEn: Long
)

// Proyección: solo las columnas que la pantalla necesita
data class NotaResumen(
    val id: Int,
    val titulo: String,
    val creadaEn: Long
)

@Query(
    "SELECT id, titulo, creadaEn FROM notas " +
    "WHERE importante = 1 ORDER BY creadaEn DESC"
)
fun observarResumenImportantes(): Flow<List<NotaResumen>>`,
    clave: "Pedir solo las columnas necesarias (proyección) y respaldar filtros y orden frecuentes con un índice."
  },

  {
    id: 20,
    nivel: 4,
    tema: "Room · Relaciones",
    titulo: "El problema de las N+1 consultas",
    contexto: "Cada nota puede tener etiquetas guardadas en otra tabla. La lista se carga lenta.",
    codigo: String.raw`suspend fun cargarNotasConEtiquetas(): List<NotaConEtiquetasUi> {
    val notas = notaDao.obtenerTodasUnaVez()
    val resultado = mutableListOf<NotaConEtiquetasUi>()

    for (nota in notas) {
        val etiquetas = etiquetaDao.obtenerPorNota(nota.id)
        resultado.add(NotaConEtiquetasUi(nota, etiquetas))
    }

    return resultado
}`,
    smells: [
      {
        linea: "etiquetaDao.obtenerPorNota",
        titulo: "N+1 consultas",
        porque: "Una consulta para las notas y otra por cada nota: con 500 notas son 501 consultas. Room resuelve la relación en una operación con {{@Relation}}."
      },
      {
        linea: "notaDao.obtenerTodasUnaVez()",
        titulo: "Sin garantía de consistencia",
        porque: "Entre la primera consulta y las siguientes los datos pueden cambiar: el resultado mezcla fotos de momentos distintos. {{@Transaction}} garantiza una lectura consistente."
      },
      {
        linea: "val resultado = mutableListOf",
        titulo: "Armado manual y resultado puntual",
        porque: "Se construye el resultado a mano y no se puede observar. Con {{@Relation}} el DAO devuelve directamente un {{Flow}} del objeto compuesto."
      }
    ],
    solucion: String.raw`data class NotaConEtiquetas(
    @Embedded val nota: NotaEntity,
    @Relation(
        parentColumn = "id",
        entityColumn = "notaId"
    )
    val etiquetas: List<EtiquetaEntity>
)

@Dao
interface NotaDAO {
    @Transaction
    @Query("SELECT * FROM notas ORDER BY creadaEn DESC")
    fun observarNotasConEtiquetas(): Flow<List<NotaConEtiquetas>>
}`,
    clave: "Relaciones: @Embedded + @Relation + @Transaction. Una lectura consistente en lugar de N+1 consultas."
  },

  {
    id: 21,
    nivel: 4,
    tema: "Room · Paging",
    titulo: "Cargarlo todo en memoria",
    contexto: "Un usuario intensivo acumuló 100.000 notas. Cada vez que agrega una, la pantalla se traba.",
    codigo: String.raw`class NotaViewModel(dao: NotaDAO) : ViewModel() {
    val notas: StateFlow<List<NotaEntity>> = dao.observarNotas()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList()
        )
}

@Query("SELECT * FROM notas ORDER BY creadaEn DESC")
fun observarNotas(): Flow<List<NotaEntity>>`,
    smells: [
      {
        linea: "dao.observarNotas()",
        titulo: "Toda la tabla en memoria",
        porque: "Las 100.000 filas viven como objetos en memoria aunque en pantalla se vean veinte. Con volúmenes grandes la memoria se agota."
      },
      {
        linea: "SELECT * FROM notas ORDER BY",
        titulo: "Re-emisión completa ante cada cambio",
        porque: "Cada insert hace que Room vuelva a ejecutar la consulta y a emitir la lista entera. El costo crece con el tamaño de la tabla. Paging 3 carga por páginas y solo actualiza lo necesario."
      }
    ],
    solucion: String.raw`// Dependencia: androidx.room:room-paging

@Dao
interface NotaDAO {
    @Query("SELECT * FROM notas ORDER BY creadaEn DESC")
    fun paginarNotas(): PagingSource<Int, NotaEntity>
}

class NotaViewModel(dao: NotaDAO) : ViewModel() {
    val notas: Flow<PagingData<NotaEntity>> = Pager(
        config = PagingConfig(pageSize = 30),
        pagingSourceFactory = { dao.paginarNotas() }
    ).flow.cachedIn(viewModelScope)
}

// En la pantalla:
// val notasPaginadas = viewModel.notas.collectAsLazyPagingItems()`,
    clave: "Tablas grandes: PagingSource de Room + Pager + cachedIn. Se carga por páginas, no la tabla completa."
  },

  {
    id: 22,
    nivel: 4,
    tema: "Testing · Room",
    titulo: "El test que falla la segunda vez",
    contexto: "El test pasa en la primera ejecución. A la segunda falla con «expected 1 but was 2».",
    codigo: String.raw`class NotaDaoTest {

    @Test
    fun insertaYLee() {
        val contexto = InstrumentationRegistry.getInstrumentation().targetContext

        val db = Room.databaseBuilder(contexto, AppDatabase::class.java, "notas-db")
            .allowMainThreadQueries()
            .build()

        runBlocking {
            db.notaDao().insertar(NotaEntity(titulo = "Hola", contenido = "Mundo"))
        }

        Thread.sleep(500)

        val notas = runBlocking { db.notaDao().obtenerTodasUnaVez() }
        assertTrue(notas.size == 1)
    }
}`,
    smells: [
      {
        linea: "Room.databaseBuilder",
        titulo: "Base real en archivo, sin cerrar",
        porque: "Los datos persisten entre ejecuciones y entre tests (por eso falla la segunda vez) y la base nunca se cierra. Los tests usan {{Room.inMemoryDatabaseBuilder}}, creada en {{@Before}} y cerrada en {{@After}}."
      },
      {
        linea: ".allowMainThreadQueries()",
        titulo: "allowMainThreadQueries en el test",
        porque: "Oculta problemas de hilos que sí ocurrirían en producción. Con funciones {{suspend}} y {{runTest}} no hace falta."
      },
      {
        linea: "runBlocking",
        titulo: "runBlocking en lugar de runTest",
        porque: "{{runTest}} (kotlinx-coroutines-test) controla el tiempo virtual y propaga mejor las fallas. {{runBlocking}} no ofrece ese control."
      },
      {
        linea: "Thread.sleep(500)",
        titulo: "Esperas con sleep",
        porque: "Test lento y frágil: depende del tiempo real. Una operación {{suspend}} ya termina cuando retorna; no hay nada que esperar."
      },
      {
        linea: "assertTrue(notas.size == 1)",
        titulo: "Aserción pobre",
        porque: "Si falla solo dice «expected true». {{assertEquals(1, notas.size)}} muestra los valores y, además, hay que verificar el contenido ({{titulo}}), no solo la cantidad."
      }
    ],
    solucion: String.raw`class NotaDaoTest {

    private lateinit var baseDeDatos: AppDatabase
    private lateinit var dao: NotaDAO

    @Before
    fun crearBaseEnMemoria() {
        val contexto = ApplicationProvider.getApplicationContext<Context>()
        baseDeDatos = Room.inMemoryDatabaseBuilder(contexto, AppDatabase::class.java)
            .build()
        dao = baseDeDatos.notaDao()
    }

    @After
    fun cerrarBase() {
        baseDeDatos.close()
    }

    @Test
    fun insertar_y_leer_devuelve_la_nota_guardada() = runTest {
        dao.insertar(NotaEntity(titulo = "Hola", contenido = "Mundo"))

        val notas = dao.obtenerTodasUnaVez()

        assertEquals(1, notas.size)
        assertEquals("Hola", notas.first().titulo)
    }
}`,
    clave: "Tests de DAO: base en memoria, @Before/@After, runTest, sin sleeps y aserciones que muestren valores."
  },

  {
    id: 23,
    nivel: 4,
    tema: "Compose · ViewModel",
    titulo: "El ViewModel que nace en cada recomposición",
    contexto: "Al escribir en el campo de texto, lo escrito desaparece de vez en cuando. Rotar la pantalla lo borra siempre.",
    codigo: String.raw`@Composable
fun PantallaNota() {
    val contexto = LocalContext.current
    val dao = AppDatabase.obtener(contexto).notaDao()
    val viewModel = NotaViewModel(dao)

    val estado by viewModel.estado.collectAsState()

    OutlinedTextField(
        value = estado.titulo,
        onValueChange = { texto -> viewModel.onEvento(NotaEvento.TituloCambiado(texto)) }
    )
}`,
    smells: [
      {
        linea: "val viewModel = NotaViewModel(dao)",
        titulo: "ViewModel instanciado a mano en la composición",
        porque: "Se crea una instancia nueva en cada recomposición, con estado vacío, y no está atada a ningún {{ViewModelStore}}: no sobrevive a la rotación. Se obtiene con {{viewModel()}} y una fábrica."
      },
      {
        linea: "AppDatabase.obtener(contexto)",
        titulo: "La UI conoce la capa de datos",
        porque: "El Composable construye el acceso a la base. Es una violación de capas: la UI no debe saber cómo se crean DAO ni base de datos. Eso se resuelve en la fábrica o en DI."
      },
      {
        linea: "collectAsState()",
        titulo: "collectAsState sin ciclo de vida",
        porque: "Usar {{collectAsStateWithLifecycle()}} para pausar la colección cuando la pantalla no es visible."
      }
    ],
    solucion: String.raw`// Fábrica que sabe cómo construir el ViewModel
val fabricaNotaViewModel = viewModelFactory {
    initializer {
        val aplicacion = this[APPLICATION_KEY] as NotasApplication
        NotaViewModel(aplicacion.baseDeDatos.notaDao())
    }
}

@Composable
fun PantallaNota(
    viewModel: NotaViewModel = viewModel(factory = fabricaNotaViewModel)
) {
    val estado by viewModel.estado.collectAsStateWithLifecycle()

    OutlinedTextField(
        value = estado.titulo,
        onValueChange = { texto ->
            viewModel.onEvento(NotaEvento.TituloCambiado(texto))
        }
    )
}

// Con Hilt: @HiltViewModel + hiltViewModel() reemplaza la fábrica manual`,
    clave: "El ViewModel se pide al framework (viewModel(factory) / hiltViewModel), nunca se construye con el constructor dentro de un Composable."
  },

  {
    id: 24,
    nivel: 4,
    tema: "Room · Concurrencia",
    titulo: "Leer, modificar, escribir",
    contexto: "El usuario toca rápido la estrella de «importante». A veces la nota queda en el estado equivocado y otras la app se cierra.",
    codigo: String.raw`suspend fun alternarImportante(id: Int) {
    val nota = dao.obtenerNotaPorId(id)!!
    val notaActualizada = nota.copy(importante = !nota.importante)
    dao.actualizar(notaActualizada)
}`,
    smells: [
      {
        linea: "!!",
        titulo: "!! sobre una consulta que puede devolver null",
        porque: "Si la nota se eliminó mientras tanto, {{obtenerNotaPorId}} devuelve {{null}} y la app se cierra con {{NullPointerException}}."
      },
      {
        linea: "dao.obtenerNotaPorId",
        titulo: "Patrón read-modify-write",
        porque: "Entre la lectura y la escritura otra corrutina puede modificar la fila. Dos toques rápidos leen el mismo valor viejo y el segundo anula al primero (lost update)."
      },
      {
        linea: "dao.actualizar(notaActualizada)",
        titulo: "Se reescribe toda la fila",
        porque: "{{@Update}} pisa todas las columnas con la copia leída antes: si el título cambió en el medio, se pierde ese cambio. Para modificar una columna, la sentencia debería tocar solo esa columna."
      }
    ],
    solucion: String.raw`// En el DAO: una sola sentencia atómica que toca solo la columna necesaria
@Query("UPDATE notas SET importante = NOT importante WHERE id = :id")
suspend fun alternarImportante(id: Int)

// En el repositorio / ViewModel
suspend fun alternarImportante(id: Int) {
    dao.alternarImportante(id)
}`,
    clave: "Cambiar una columna: UPDATE ... SET col = ... WHERE id. Lo que se puede resolver en SQL no se resuelve leyendo y reescribiendo en Kotlin."
  },

  /* ===================== NIVEL 5 ===================== */
  {
    id: 25,
    nivel: 5,
    tema: "Flow · Búsqueda",
    titulo: "Buscador con resultados desordenados",
    contexto: "Al escribir rápido en el buscador, a veces los resultados corresponden a una palabra anterior a la que se ve en el campo.",
    codigo: String.raw`class BuscadorViewModel(private val dao: NotaDAO) : ViewModel() {

    var resultados by mutableStateOf<List<NotaEntity>>(emptyList())

    fun onTextoCambiado(texto: String) {
        viewModelScope.launch {
            resultados = dao.buscar(texto)
        }
    }
}`,
    smells: [
      {
        linea: "var resultados",
        titulo: "Estado público y mutable",
        porque: "Cualquiera puede asignarlo, y es un tipo de Compose dentro del ViewModel. Se expone un {{StateFlow}} de solo lectura."
      },
      {
        linea: "viewModelScope.launch",
        titulo: "Una corrutina por tecla, sin cancelar la anterior",
        porque: "Las consultas se solapan: una búsqueda vieja que tarda más puede terminar después de la nueva y pisar el resultado (race condition). Falta {{debounce}} y cancelar la búsqueda anterior con {{flatMapLatest}}."
      },
      {
        linea: "dao.buscar(texto)",
        titulo: "Sin normalizar ni tratar el texto vacío",
        porque: "Texto vacío o con espacios dispara una consulta que devuelve todo. Se hace {{trim()}}, {{distinctUntilChanged()}} y se define qué se muestra sin texto."
      }
    ],
    solucion: String.raw`class BuscadorViewModel(private val dao: NotaDAO) : ViewModel() {

    private val textoBusqueda = MutableStateFlow("")

    @OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
    val resultados: StateFlow<List<NotaEntity>> = textoBusqueda
        .debounce(300)
        .map { texto -> texto.trim() }
        .distinctUntilChanged()
        .flatMapLatest { texto ->
            if (texto.isEmpty()) {
                flowOf(emptyList())
            } else {
                dao.observarBusqueda(texto)
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList()
        )

    fun onTextoCambiado(texto: String) {
        textoBusqueda.value = texto
    }
}`,
    clave: "Búsqueda reactiva: debounce + distinctUntilChanged + flatMapLatest. Solo importa la última consulta."
  },

  {
    id: 26,
    nivel: 5,
    tema: "DataStore",
    titulo: "runBlocking sobre DataStore",
    contexto: "Migraron preferencias a DataStore «por modernidad», pero la app arranca con un tirón de 400 ms y a veces se cierra por ANR.",
    codigo: String.raw`class AjustesRepository(private val dataStore: DataStore<Preferences>) {

    private val clave = booleanPreferencesKey("ordenar_por_fecha")

    fun ordenarPorFecha(): Boolean {
        return runBlocking {
            dataStore.data.first()[clave] ?: true
        }
    }

    fun guardarOrdenarPorFecha(valor: Boolean) {
        runBlocking {
            dataStore.edit { preferencias -> preferencias[clave] = valor }
        }
    }
}

// Llamado directamente desde onCreate() de la Activity`,
    smells: [
      {
        linea: "fun ordenarPorFecha(): Boolean",
        titulo: "Valor puntual en lugar de Flow",
        porque: "DataStore expone un {{Flow}}. Devolver un {{Boolean}} fijo hace que la UI no se entere cuando la preferencia cambia."
      },
      {
        linea: "runBlocking",
        ocurrencia: 1,
        titulo: "runBlocking en lectura",
        porque: "Bloquea el hilo principal hasta que termina la lectura del disco: es lo que DataStore intenta evitar. Se hace asíncrona."
      },
      {
        linea: "runBlocking",
        ocurrencia: 2,
        titulo: "runBlocking en escritura",
        porque: "Lo mismo para la escritura: {{edit}} es {{suspend}} y debe llamarse desde una corrutina, no bloqueando el hilo que llama."
      }
    ],
    solucion: String.raw`class AjustesRepository(private val dataStore: DataStore<Preferences>) {

    private val clave = booleanPreferencesKey("ordenar_por_fecha")

    val ordenarPorFecha: Flow<Boolean> = dataStore.data
        .map { preferencias -> preferencias[clave] ?: true }

    suspend fun guardarOrdenarPorFecha(valor: Boolean) {
        dataStore.edit { preferencias ->
            preferencias[clave] = valor
        }
    }
}

// En el ViewModel
val ordenarPorFecha: StateFlow<Boolean> = repositorio.ordenarPorFecha
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = true
    )

fun cambiarOrden(valor: Boolean) {
    viewModelScope.launch {
        repositorio.guardarOrdenarPorFecha(valor)
    }
}`,
    clave: "DataStore es asíncrono de punta a punta: lectura con Flow, escritura con suspend, nunca runBlocking en Main."
  },

  {
    id: 27,
    nivel: 5,
    tema: "Compose · Lista",
    titulo: "La lista que se recalcula todo",
    contexto: "Al hacer scroll por 2.000 notas la lista tartamudea y, al agregar una nota nueva arriba, se pierde el estado de los ítems.",
    codigo: String.raw`@Composable
fun ListaNotas(notas: List<NotaEntity>) {
    LazyColumn {
        items(notas.sortedByDescending { nota -> nota.creadaEn }) { nota ->
            val formato = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
            val fecha = formato.format(Date(nota.creadaEn))
            val titulo = nota.titulo
            Text(text = "$titulo - $fecha")
        }
    }
}`,
    smells: [
      {
        linea: "sortedByDescending",
        titulo: "Ordenar dentro del Composable",
        porque: "Se reordena toda la lista en cada recomposición. El orden se resuelve en la consulta ({{ORDER BY}}) y no en la UI."
      },
      {
        linea: "items(",
        titulo: "Items sin key",
        porque: "Sin {{key}}, Compose identifica los ítems por posición: al insertar uno arriba todos se desplazan y se pierde su estado interno y su animación. Se usa el parámetro {{key}} con el id de la nota."
      },
      {
        linea: "SimpleDateFormat",
        titulo: "Objeto costoso creado por cada ítem",
        porque: "{{SimpleDateFormat}} es caro de crear (y no es thread-safe). Aquí se instancia una vez por ítem y por recomposición. El formateo se hace una sola vez fuera de la lista."
      },
      {
        linea: "notas: List<NotaEntity>",
        titulo: "Entidad de base de datos en la UI",
        porque: "El Composable depende del modelo de persistencia y además formatea datos. Se mapea a un modelo de UI ({{NotaItemUi}}) con la fecha ya formateada."
      }
    ],
    solucion: String.raw`// Modelo de UI: lo que la pantalla necesita, ya listo para mostrar
data class NotaItemUi(
    val id: Int,
    val titulo: String,
    val fechaFormateada: String
)

private val formatoFecha: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd/MM/yyyy").withZone(ZoneId.systemDefault())

fun NotaEntity.aItemUi(): NotaItemUi {
    val fecha = formatoFecha.format(Instant.ofEpochMilli(creadaEn))
    return NotaItemUi(id = id, titulo = titulo, fechaFormateada = fecha)
}

// En el ViewModel: ya viene ordenada desde SQL (ORDER BY creadaEn DESC)
// val notas = dao.observarNotas().map { lista -> lista.map { nota -> nota.aItemUi() } }

@Composable
fun ListaNotas(notas: List<NotaItemUi>) {
    LazyColumn {
        items(items = notas, key = { nota -> nota.id }) { nota ->
            Text(text = nota.titulo + " - " + nota.fechaFormateada)
        }
    }
}`,
    clave: "Orden en SQL, mapeo a modelo de UI en el ViewModel, formateadores reutilizados y LazyColumn con key estable."
  },

  {
    id: 28,
    nivel: 5,
    tema: "Arquitectura · Fuente de verdad",
    titulo: "Dos verdades",
    contexto: "A veces, tras eliminar y agregar notas, la lista de la pantalla tiene datos que no están en la base (o al revés).",
    codigo: String.raw`class NotaViewModel(private val dao: NotaDAO) : ViewModel() {

    private val _notas = mutableListOf<NotaEntity>()
    val notas = MutableStateFlow<List<NotaEntity>>(emptyList())

    fun agregar(titulo: String) {
        val nota = NotaEntity(id = _notas.size + 1, titulo = titulo, contenido = "")
        _notas.add(nota)
        notas.value = _notas.toList()
        viewModelScope.launch { dao.insertar(nota) }
    }

    fun eliminar(nota: NotaEntity) {
        _notas.remove(nota)
        notas.value = _notas.toList()
        viewModelScope.launch { dao.eliminar(nota) }
    }
}`,
    smells: [
      {
        linea: "private val _notas = mutableListOf",
        titulo: "Dos fuentes de verdad",
        porque: "Existen una lista en memoria y una tabla en disco que se sincronizan a mano. Si un insert falla, la pantalla muestra una nota que no existe. La base de datos debe ser la única fuente de verdad."
      },
      {
        linea: "id = _notas.size + 1",
        titulo: "Ids generados a mano",
        porque: "Tras eliminar una nota, {{size + 1}} repite un id existente y el insert falla o pisa otra fila. Para eso existe {{autoGenerate}}."
      },
      {
        linea: "val notas = MutableStateFlow",
        titulo: "MutableStateFlow público",
        porque: "Cualquier clase puede modificar la lista y desincronizarla aún más. Se expone de solo lectura."
      },
      {
        linea: "viewModelScope.launch { dao.insertar(nota) }",
        titulo: "Escritura «dispara y olvida»",
        porque: "La UI se actualiza de forma optimista y la persistencia ocurre después, sin verificar el resultado ni manejar errores."
      }
    ],
    solucion: String.raw`class NotaViewModel(private val dao: NotaDAO) : ViewModel() {

    // La base de datos es la única fuente de verdad
    val notas: StateFlow<List<NotaEntity>> = dao.observarNotas()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList()
        )

    fun agregar(titulo: String) {
        viewModelScope.launch {
            // id = 0 por defecto: SQLite genera el id
            dao.insertar(NotaEntity(titulo = titulo, contenido = ""))
        }
    }

    fun eliminar(nota: NotaEntity) {
        viewModelScope.launch {
            dao.eliminar(nota)
        }
    }
}`,
    clave: "Single source of truth: escribir en la base y dejar que el Flow actualice la UI. Sin copias en memoria ni ids manuales."
  },

  {
    id: 29,
    nivel: 5,
    tema: "UiState · Modelado",
    titulo: "Estados imposibles",
    contexto: "La pantalla de lista muestra a veces el indicador de carga y el mensaje de error a la vez, o queda cargando para siempre.",
    codigo: String.raw`data class NotasUiState(
    val cargando: Boolean = false,
    val error: String? = null,
    val notas: List<NotaEntity> = emptyList(),
    val vacio: Boolean = false
)

fun cargar() {
    viewModelScope.launch {
        _estado.update { estadoActual -> estadoActual.copy(cargando = true) }

        val notas = dao.obtenerTodasUnaVez()

        _estado.update { estadoActual ->
            estadoActual.copy(cargando = false, notas = notas, vacio = notas.isEmpty())
        }
    }
}`,
    smells: [
      {
        linea: "val cargando: Boolean",
        titulo: "Combinaciones imposibles",
        porque: "Con {{cargando}} y {{error}} sueltos, el tipo permite {{cargando = true}} con un error a la vez, que no tiene sentido. Una {{sealed interface}} permite solo los estados válidos."
      },
      {
        linea: "val vacio: Boolean",
        titulo: "Estado derivado guardado aparte",
        porque: "{{vacio}} se puede calcular con {{notas.isEmpty()}}. Guardarlo duplica información que puede quedar contradictoria."
      },
      {
        linea: "val notas: List<NotaEntity>",
        titulo: "Entidades dentro del estado de UI",
        porque: "El estado de pantalla depende del modelo de persistencia. Cualquier cambio en la tabla se filtra a la UI."
      },
      {
        linea: "val notas = dao.obtenerTodasUnaVez()",
        titulo: "Sin try/catch: el estado queda trabado",
        porque: "Si la consulta falla, {{cargando}} nunca vuelve a {{false}} y la corrutina cancela a su padre. Todo error debe terminar en un estado de error."
      }
    ],
    solucion: String.raw`sealed interface NotasUiState {
    data object Cargando : NotasUiState
    data object SinNotas : NotasUiState
    data class ConNotas(val notas: List<NotaItemUi>) : NotasUiState
    data class Error(val mensaje: String) : NotasUiState
}

val estado: StateFlow<NotasUiState> = dao.observarNotas()
    .map { entidades ->
        if (entidades.isEmpty()) {
            NotasUiState.SinNotas
        } else {
            NotasUiState.ConNotas(entidades.map { entidad -> entidad.aItemUi() })
        }
    }
    .catch { emit(NotasUiState.Error("No se pudieron cargar las notas")) }
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = NotasUiState.Cargando
    )

// En el Composable:
// when (estado) {
//     NotasUiState.Cargando -> IndicadorDeCarga()
//     NotasUiState.SinNotas -> MensajeSinNotas()
//     is NotasUiState.ConNotas -> ListaNotas(estado.notas)
//     is NotasUiState.Error -> MensajeDeError(estado.mensaje)
// }`,
    clave: "Modelar el estado de pantalla como sealed interface: cada estado es exactamente uno y los estados imposibles no compilan."
  },

  {
    id: 30,
    nivel: 5,
    tema: "Integrador · Todo junto",
    titulo: "El jefe final",
    contexto: "Un ViewModel que mezcla todo lo visto. Encuentra todos los problemas y propón la arquitectura correcta.",
    codigo: String.raw`class NotaViewModel(contexto: Context) : ViewModel() {

    private val db = Room.databaseBuilder(contexto, AppDatabase::class.java, "notas-db")
        .allowMainThreadQueries()
        .fallbackToDestructiveMigration()
        .build()

    val notas = MutableStateFlow<List<NotaEntity>>(emptyList())
    var error: String? = null

    init {
        notas.value = db.notaDao().obtenerTodasUnaVez()
    }

    fun guardar(titulo: String, contenido: String, importante: Int) {
        GlobalScope.launch(Dispatchers.IO) {
            val existentes = db.notaDao().obtenerTodasUnaVez()
            val nota = NotaEntity(
                id = existentes.size + 1,
                titulo = titulo,
                contenido = contenido,
                importante = importante == 1,
                creadaEn = System.currentTimeMillis(),
                archivada = false
            )
            try {
                db.notaDao().insertar(nota)
                notas.value = db.notaDao().obtenerTodasUnaVez()
            } catch (e: Exception) {
                error = "Error"
            }
        }
    }
}`,
    smells: [
      {
        linea: "contexto: Context",
        titulo: "Context en el ViewModel",
        porque: "Un ViewModel no debe conocer el Context: complica los tests y, si es una Activity, causa fugas. Recibe un DAO o repositorio ya construido."
      },
      {
        linea: "Room.databaseBuilder(contexto",
        titulo: "La base se construye dentro del ViewModel",
        porque: "Cada ViewModel crea su propia instancia de la base. La base debe ser un singleton creado a nivel de aplicación o DI."
      },
      {
        linea: ".allowMainThreadQueries()",
        titulo: "allowMainThreadQueries",
        porque: "Habilita consultas en el hilo principal en lugar de resolver el problema con corrutinas."
      },
      {
        linea: ".fallbackToDestructiveMigration()",
        titulo: "Migración destructiva",
        porque: "Un cambio de esquema borra las notas de todos los usuarios. Hace falta una {{Migration}} explícita."
      },
      {
        linea: "val notas = MutableStateFlow",
        titulo: "MutableStateFlow público y refresco manual",
        porque: "El estado se puede modificar desde afuera y hay que recargar la lista a mano. Debe exponerse el {{Flow}} del DAO como {{StateFlow}} de solo lectura."
      },
      {
        linea: "var error: String? = null",
        titulo: "Error como variable común",
        porque: "No es observable: la UI nunca se entera de que cambió. El error forma parte del estado de UI ({{StateFlow}})."
      },
      {
        linea: "db.notaDao().obtenerTodasUnaVez()",
        ocurrencia: 1,
        titulo: "Consulta bloqueante en init",
        porque: "Se ejecuta en el hilo principal al crear el ViewModel y se congela la pantalla durante el arranque."
      },
      {
        linea: "GlobalScope.launch",
        titulo: "GlobalScope",
        porque: "La corrutina no está atada al ViewModel y sigue viva aunque la pantalla se cierre. Corresponde {{viewModelScope}}."
      },
      {
        linea: "id = existentes.size + 1",
        titulo: "Id manual calculado leyendo toda la tabla",
        porque: "Lee toda la tabla solo para calcular un id, y tras borrar notas genera ids repetidos. Se usa {{autoGenerate}}."
      },
      {
        linea: "importante: Int",
        titulo: "Booleano como Int",
        porque: "El parámetro debería ser {{Boolean}}. Comparar con {{== 1}} es un número mágico."
      },
      {
        linea: "catch (e: Exception)",
        titulo: "Captura genérica con error inútil",
        porque: "Traga {{CancellationException}} y el mensaje «Error» no ayuda al usuario ni al desarrollador. Se relanza la cancelación y se publica un mensaje claro en el estado."
      }
    ],
    solucion: String.raw`// 1) La base de datos es única: se crea en Application o con DI (@Singleton),
//    con applicationContext y con Migrations reales (sin allowMainThreadQueries
//    ni fallbackToDestructiveMigration).

// 2) El ViewModel solo conoce el DAO (o un repositorio), nunca un Context.
class NotaViewModel(private val dao: NotaDAO) : ViewModel() {

    // La base de datos es la fuente de verdad
    val notas: StateFlow<List<NotaEntity>> = dao.observarNotas()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList()
        )

    private val _estado = MutableStateFlow(NotaUiState())
    val estado: StateFlow<NotaUiState> = _estado.asStateFlow()

    fun guardar(titulo: String, contenido: String, importante: Boolean) {
        if (titulo.isBlank()) {
            _estado.update { estadoActual ->
                estadoActual.copy(error = "El título no puede estar vacío")
            }
            return
        }

        viewModelScope.launch {
            try {
                val nota = NotaEntity(
                    titulo = titulo.trim(),
                    contenido = contenido,
                    importante = importante
                )
                dao.insertar(nota)
            } catch (cancelacion: CancellationException) {
                throw cancelacion
            } catch (excepcion: Exception) {
                _estado.update { estadoActual ->
                    estadoActual.copy(error = "No se pudo guardar la nota. Inténtalo de nuevo.")
                }
            }
        }
    }
}`,
    clave: "Capas con responsabilidades claras: base única (Application/DI) → DAO con Flow → ViewModel con StateFlow de solo lectura → UI que envía eventos."
  }
];
