#include <node_api.h>
#include <string.h>
#include "internal.h"
static const napi_type_tag gd_owner_tag = { UINT64_C(0x82cbf466f8a1472d), UINT64_C(0xa1b4c94086cf2067) };

static void gd_account(napi_env env, gd_document *doc) {
    GD_PROFILE_SCOPE(GP_BIND_ACCOUNT);
    int64_t change = (int64_t) doc->bytes - doc->accounted;
    if (change) {
        int64_t total;
        if (napi_adjust_external_memory(env, change, &total) == napi_ok) doc->accounted += change;
    }
}

static void gd_finalize(napi_env env, void *data, void *hint) {
    (void) hint;
    gd_document *doc = data;
    gk_dispose(doc);
    gd_account(env, doc);
    gk_delete(doc); /* The tiny closed owner survives explicit disposal until GC. */
}

static napi_value gd_error(napi_env env, const char *code, const char *message) {
    napi_throw_error(env, code, message);
    return NULL;
}

static napi_value gd_finish(napi_env env, gd_document *doc, napi_value result) {
    gd_account(env, doc);
    return result;
}

static gd_document *gd_owner(napi_env env, napi_value value, int allow_closed) {
    GD_PROFILE_SCOPE(GP_BIND_CHECKS);
    bool valid = false;
    gd_document *doc = NULL;
    if (napi_check_object_type_tag(env, value, &gd_owner_tag, &valid) != napi_ok || !valid ||
        napi_unwrap(env, value, (void **) &doc) != napi_ok || !doc) {
        gd_error(env, "ERR_GROVEDOM_HANDLE", "Invalid document owner");
        return NULL;
    }
    if (doc->closed && !allow_closed) {
        gd_error(env, "ERR_GROVEDOM_DISPOSED", "Document has been disposed");
        return NULL;
    }
    return doc;
}

static int gd_arguments(napi_env env, napi_callback_info info, size_t count, napi_value *args) {
    size_t actual = count;
    if (napi_get_cb_info(env, info, &actual, args, NULL, NULL) != napi_ok || actual != count) {
        gd_error(env, "ERR_GROVEDOM_ARGUMENT", "Invalid native argument count");
        return 0;
    }
    return 1;
}

static int gd_string(napi_env env, gd_document *doc, napi_value value) {
    GD_PROFILE_SCOPE(GP_BIND_INPUT);
    size_t length;
    if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok || length > UINT32_MAX) {
        gd_error(env, "ERR_GROVEDOM_ARGUMENT", "Expected a UTF-8 encodable string");
        return 0;
    }
    if (!gk_input(doc, length)) {
        gd_error(env, "ERR_GROVEDOM_MEMORY", "Input allocation failed");
        return 0;
    }
    if (napi_get_value_string_utf8(env, value, (char *) doc->input.data, length + 1, &doc->input.length) != napi_ok) {
        gd_error(env, "ERR_GROVEDOM_ARGUMENT", "String transfer failed");
        return 0;
    }
    return 1;
}

static int gd_typed(napi_env env, napi_value value, napi_typedarray_type expected, void **data, size_t *length) {
    GD_PROFILE_SCOPE(GP_BIND_CHECKS);
    napi_typedarray_type type;
    napi_value buffer;
    size_t offset;
    bool ordinary = false;
    if (napi_get_typedarray_info(env, value, &type, length, data, &buffer, &offset) != napi_ok ||
        type != expected || (*length && !*data) ||
        napi_is_arraybuffer(env, buffer, &ordinary) != napi_ok || !ordinary) {
        gd_error(env, "ERR_GROVEDOM_ARGUMENT", "Expected an ordinary typed array of the required type");
        return 0;
    }
    return 1;
}

static napi_value gd_value(napi_env env, gd_document *doc, const gd_result *value) {
    GD_PROFILE_SCOPE(GP_BIND_OUTPUT);
    napi_value result = NULL;
    napi_status status = napi_ok;
    if (!value) return gd_finish(env, doc, gd_error(env, doc->error_code, doc->error_message));
    switch (value->kind) {
        case GD_UNDEFINED: status = napi_get_undefined(env, &result); break;
        case GD_NULL: status = napi_get_null(env, &result); break;
        case GD_NUMBER: status = napi_create_uint32(env, value->number, &result); break;
        case GD_STRING: status = napi_create_string_utf8(env, value->length ? value->data : "", value->length, &result); break;
        case GD_IDS: {
            if (!value->length) {
                void *cached = NULL;
                status = napi_get_instance_data(env, &cached);
                if (status == napi_ok) status = napi_get_reference_value(env, cached, &result);
                break;
            }
            napi_value buffer; void *data; size_t bytes = value->length * sizeof(uint32_t);
            status = napi_create_arraybuffer(env, bytes, &data, &buffer);
            if (status == napi_ok) {
                if (bytes) memcpy(data, value->data, bytes);
                status = napi_create_typedarray(env, napi_uint32_array, value->length, buffer, 0, &result);
            }
            break;
        }
    }
    if (status != napi_ok) result = gd_error(env, "ERR_GROVEDOM_MEMORY", "Result materialization failed");
    return gd_finish(env, doc, result);
}
static napi_value gd_create_impl(napi_env env, napi_callback_info info, int xml) {
    napi_value args[3], owner;
    bool scripting = true, fragment = false;
    uint32_t flags = 0;
    if (!gd_arguments(env, info, xml ? 2 : 3, args)) return NULL;
    if (xml) {
        if (napi_get_value_uint32(env, args[1], &flags) != napi_ok) return gd_error(env, "ERR_GROVEDOM_ARGUMENT", "Expected XML flags");
    } else if (napi_get_value_bool(env, args[1], &scripting) != napi_ok || napi_get_value_bool(env, args[2], &fragment) != napi_ok) return gd_error(env, "ERR_GROVEDOM_ARGUMENT", "Expected parser flags");
    gd_document *doc = gk_new();
    if (!doc) return gd_error(env, "ERR_GROVEDOM_MEMORY", "Owner allocation failed");
    if (!gd_string(env, doc, args[0])) goto failed;
    if (!(xml ? gk_parse_xml(doc, flags) : gk_parse(doc, scripting, fragment))) { gd_error(env, doc->error_code, doc->error_message); goto failed; }
    if (napi_create_object(env, &owner) != napi_ok || napi_type_tag_object(env, owner, &gd_owner_tag) != napi_ok ||
        napi_wrap(env, owner, doc, gd_finalize, NULL, NULL) != napi_ok) goto failed;
    return gd_finish(env, doc, owner);
failed:
    gk_delete(doc);
    bool pending = false;
    napi_is_exception_pending(env, &pending);
    return pending ? NULL : gd_error(env, "ERR_GROVEDOM_MEMORY", "Document creation failed");
}
static napi_value gd_create(napi_env env, napi_callback_info info) { return gd_create_impl(env, info, 0); }
static napi_value gd_create_xml(napi_env env, napi_callback_info info) { return gd_create_impl(env, info, 1); }

static napi_value gd_dispose(napi_env env, napi_callback_info info) {
    napi_value args[1], result;
    if (!gd_arguments(env, info, 1, args)) return NULL;
    gd_document *doc = gd_owner(env, args[0], 1);
    if (!doc) return NULL;
    gk_dispose(doc);
    napi_get_undefined(env, &result);
    return gd_finish(env, doc, result);
}

static napi_value gd_query(napi_env env, napi_callback_info info) {
    napi_value args[4];
    if (!gd_arguments(env, info, 4, args)) return NULL;
    gd_document *doc = gd_owner(env, args[0], 0);
    if (!doc) return NULL;
    uint32_t *ids; size_t count; bool match;
    if (!gd_string(env, doc, args[1]) || !gd_typed(env, args[2], napi_uint32_array, (void **) &ids, &count)) return gd_finish(env, doc, NULL);
    if (napi_get_value_bool(env, args[3], &match) != napi_ok) return gd_finish(env, doc, gd_error(env, "ERR_GROVEDOM_ARGUMENT", "Expected matching flag"));
    return gd_value(env, doc, gk_query(doc, ids, count, match));
}
static napi_value gd_matches(napi_env env, napi_callback_info info) {
    napi_value args[3];
    if (!gd_arguments(env, info, 3, args)) return NULL;
    gd_document *doc = gd_owner(env, args[0], 0);
    if (!doc) return NULL;
    uint32_t one, *ids; size_t count;
    if (!gd_string(env, doc, args[1])) return gd_finish(env, doc, NULL);
    if (napi_get_value_uint32(env, args[2], &one) == napi_ok) { ids = &one; count = 1; }
    else if (!gd_typed(env, args[2], napi_uint32_array, (void **) &ids, &count)) return gd_finish(env, doc, NULL);
    return gd_value(env, doc, gk_query(doc, ids, count, GD_QUERY_ANY));
}
static napi_value gd_read_args(napi_env env, gd_document *doc, napi_value *args) {
    uint32_t operation, one, *ids; size_t count;
    if (napi_get_value_uint32(env, args[1], &operation) != napi_ok) return gd_finish(env, doc, gd_error(env, "ERR_GROVEDOM_ARGUMENT", "Expected read operation"));
    if (napi_get_value_uint32(env, args[2], &one) == napi_ok) { ids = &one; count = 1; }
    else if (!gd_typed(env, args[2], napi_uint32_array, (void **) &ids, &count)) return gd_finish(env, doc, NULL);
    if (operation == READ_ATTR && !gd_string(env, doc, args[3])) return gd_finish(env, doc, NULL);
    return gd_value(env, doc, gk_read(doc, operation, ids, count));
}
static napi_value gd_read(napi_env env, napi_callback_info info) {
    napi_value args[4];
    if (!gd_arguments(env, info, 4, args)) return NULL;
    gd_document *doc = gd_owner(env, args[0], 0);
    return doc ? gd_read_args(env, doc, args) : NULL;
}
static napi_value gd_observe(napi_env env, napi_callback_info info) {
    napi_value args[6];
    if (!gd_arguments(env, info, 6, args)) return NULL;
    gd_document *doc = gd_owner(env, args[0], 0);
    if (!doc) return NULL;
    uint32_t *words; unsigned char *payload; size_t length, bytes;
    if (!gd_typed(env, args[4], napi_uint32_array, (void **) &words, &length) || !gd_typed(env, args[5], napi_uint8_array, (void **) &payload, &bytes)) return gd_finish(env, doc, NULL);
    if (!gk_execute(doc, words, length, payload, bytes)) return gd_finish(env, doc, gd_error(env, doc->error_code, doc->error_message));
    return gd_read_args(env, doc, args);
}
static napi_value gd_traverse(napi_env env, napi_callback_info info) {
    napi_value args[3];
    if (!gd_arguments(env, info, 3, args)) return NULL;
    gd_document *doc = gd_owner(env, args[0], 0);
    if (!doc) return NULL;
    uint32_t axis, *ids; size_t count;
    if (napi_get_value_uint32(env, args[2], &axis) != napi_ok) return gd_finish(env, doc, gd_error(env, "ERR_GROVEDOM_ARGUMENT", "Expected traversal axis"));
    if (!gd_typed(env, args[1], napi_uint32_array, (void **) &ids, &count)) return gd_finish(env, doc, NULL);
    return gd_value(env, doc, gk_traverse(doc, ids, count, axis));
}
static napi_value gd_execute(napi_env env, napi_callback_info info) {
    napi_value args[3], result = NULL;
    if (!gd_arguments(env, info, 3, args)) return NULL;
    gd_document *doc = gd_owner(env, args[0], 0);
    if (!doc) return NULL;
    uint32_t *words; unsigned char *payload; size_t length, bytes;
    if (!gd_typed(env, args[1], napi_uint32_array, (void **) &words, &length) || !gd_typed(env, args[2], napi_uint8_array, (void **) &payload, &bytes)) return gd_finish(env, doc, NULL);
    if (!gk_execute(doc, words, length, payload, bytes)) return gd_finish(env, doc, gd_error(env, doc->error_code, doc->error_message));
    napi_get_undefined(env, &result);
    return gd_finish(env, doc, result);
}

static napi_value gd_edit(napi_env env, napi_callback_info info) {
    napi_value args[5];
    if (!gd_arguments(env, info, 5, args)) return NULL;
    gd_document *doc = gd_owner(env, args[0], 0);
    if (!doc) return NULL;
    uint32_t operation, *ids, *other; size_t count, other_count;
    if (napi_get_value_uint32(env, args[1], &operation) != napi_ok) return gd_finish(env, doc, gd_error(env, "ERR_GROVEDOM_ARGUMENT", "Expected edit operation"));
    if (!gd_typed(env, args[2], napi_uint32_array, (void **) &ids, &count) ||
        !gd_typed(env, args[3], napi_uint32_array, (void **) &other, &other_count) || !gd_string(env, doc, args[4])) return gd_finish(env, doc, NULL);
    return gd_value(env, doc, gk_edit(doc, operation, ids, count, other, other_count));
}

static napi_value gd_stats(napi_env env, napi_callback_info info) {
    (void) info;
    napi_value result, value;
    napi_create_object(env, &result);
    const char *names[] = { "liveDocuments", "liveBytes", "peakBytes", "allocations", "controlBytes" };
    const size_t *values = gk_stats();
    for (size_t i = 0; i < 5; i++) {
        napi_create_double(env, (double) values[i], &value);
        napi_set_named_property(env, result, names[i], value);
    }
    return result;
}

#ifdef GROVEDOM_PROFILE
static napi_value gd_profile(napi_env env, napi_callback_info info) {
    (void) info;
    napi_value result;
    napi_create_object(env, &result);
    const double *data = gk_profile_snapshot();
    for (unsigned i = 0; i < gk_profile_count(); i++) {
        napi_value row, value;
        napi_create_array_with_length(env, 5, &row);
        for (unsigned j = 0; j < 5; j++) {
            napi_create_double(env, data[i * 5 + j], &value);
            napi_set_element(env, row, j, value);
        }
        napi_set_named_property(env, result, gk_profile_name(i), row);
    }
    return result;
}
static napi_value gd_profile_reset(napi_env env, napi_callback_info info) {
    (void) info;
    gk_profile_reset();
    napi_value result; napi_get_undefined(env, &result); return result;
}
static napi_value gd_profile_probe(napi_env env, napi_callback_info info) {
    gk_profile_probe(10000); return gd_profile(env, info);
}
#endif

static void gd_binding_finalize(napi_env env, void *data, void *hint) {
    (void) hint;
    napi_delete_reference(env, data);
}

NAPI_MODULE_INIT() {
    // Empty snapshots are immutable inside the facade. Reuse one private
    // result per addon environment, including independently loaded workers.
    napi_value buffer, empty;
    napi_ref reference;
    void *data;
    if (napi_create_arraybuffer(env, 0, &data, &buffer) != napi_ok ||
        napi_create_typedarray(env, napi_uint32_array, 0, buffer, 0, &empty) != napi_ok ||
        napi_create_reference(env, empty, 1, &reference) != napi_ok) return NULL;
    if (napi_set_instance_data(env, reference, gd_binding_finalize, NULL) != napi_ok) {
        napi_delete_reference(env, reference);
        return NULL;
    }
    napi_property_descriptor methods[] = {
#ifdef GROVEDOM_PROFILE
        { "profile", NULL, gd_profile, NULL, NULL, NULL, napi_default, NULL },
        { "profileReset", NULL, gd_profile_reset, NULL, NULL, NULL, napi_default, NULL },
        { "profileProbe", NULL, gd_profile_probe, NULL, NULL, NULL, napi_default, NULL },
#endif
        { "create", NULL, gd_create, NULL, NULL, NULL, napi_default, NULL },
        { "createXML", NULL, gd_create_xml, NULL, NULL, NULL, napi_default, NULL },
        { "dispose", NULL, gd_dispose, NULL, NULL, NULL, napi_default, NULL },
        { "query", NULL, gd_query, NULL, NULL, NULL, napi_default, NULL },
        { "matches", NULL, gd_matches, NULL, NULL, NULL, napi_default, NULL },
        { "read", NULL, gd_read, NULL, NULL, NULL, napi_default, NULL },
        { "observe", NULL, gd_observe, NULL, NULL, NULL, napi_default, NULL },
        { "traverse", NULL, gd_traverse, NULL, NULL, NULL, napi_default, NULL },
        { "execute", NULL, gd_execute, NULL, NULL, NULL, napi_default, NULL },
        { "edit", NULL, gd_edit, NULL, NULL, NULL, napi_default, NULL },
        { "stats", NULL, gd_stats, NULL, NULL, NULL, napi_default, NULL }
    };
    if (napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods) != napi_ok) return NULL;
    return exports;
}
