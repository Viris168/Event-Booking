package com.eventbooking.catalog;

import com.eventbooking.model.Event;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/**
 * Captures the fields an admin actually reviews, and diffs two captures.
 *
 * <p>This is what turns a re-review into a diff. An organiser who fixes one
 * word and resubmits currently costs an admin a full re-read, because nothing
 * records what was approved last time. With a snapshot on each decision, the
 * second review is "title changed, everything else identical".
 *
 * <p>Only reviewable fields are captured. Sold counts, timestamps and ids are
 * not content and would show up as noise in every diff; images are referenced
 * by public id, which changes on every re-upload even when the picture is the
 * same, so they are compared by presence rather than value.
 */
@Component
public class EventSnapshotter {

    /**
     * Field order is display order: the diff is rendered in this sequence, and
     * a LinkedHashMap keeps it stable rather than letting JSON key order decide
     * how the reviewer reads the change.
     */
    private static final List<String> FIELD_ORDER = List.of(
            "slug", "title_en", "title_km", "description_en", "description_km",
            "category", "venue_id", "inventory_mode",
            "starts_at", "doors_open_at", "sales_open_at", "sales_close_at",
            "has_cover_image", "has_banner_image");

    private final ObjectMapper objectMapper;

    public EventSnapshotter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** The reviewable state of an event, as a JSON string for the snapshot column. */
    public String capture(Event event) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("slug", event.getSlug());
        fields.put("title_en", event.getTitleEn());
        fields.put("title_km", event.getTitleKm());
        fields.put("description_en", event.getDescriptionEn());
        fields.put("description_km", event.getDescriptionKm());
        fields.put("category", event.getCategory());
        // The id, not the whole venue: a venue rename is the venue's history,
        // not this event's, and would otherwise appear as a change to an event
        // nobody touched.
        fields.put("venue_id", event.getVenue() == null ? null : event.getVenue().getId());
        fields.put("inventory_mode", str(event.getInventoryMode()));
        fields.put("starts_at", str(event.getStartsAt()));
        fields.put("doors_open_at", str(event.getDoorsOpenAt()));
        fields.put("sales_open_at", str(event.getSalesOpenAt()));
        fields.put("sales_close_at", str(event.getSalesCloseAt()));
        fields.put("has_cover_image", event.getCloudinaryImageId() != null);
        fields.put("has_banner_image", event.getCloudinaryBannerId() != null);
        try {
            return objectMapper.writeValueAsString(fields);
        } catch (Exception e) {
            // A snapshot is an aid to review, not a precondition for it. Failing
            // the whole approval because one field would not serialise would be
            // a worse outcome than reviewing without a diff.
            return null;
        }
    }

    /**
     * What changed between a stored snapshot and the event now.
     *
     * <p>An absent snapshot yields an empty list rather than "everything
     * changed": events reviewed before this existed have no baseline, and
     * claiming every field is new would be a lie the reviewer has to check.
     */
    public List<FieldChange> diff(String previousSnapshotJson, Event current) {
        return diff(previousSnapshotJson, capture(current));
    }

    /**
     * Diff two stored snapshots.
     *
     * <p>The review history compares one saved decision against the one before
     * it, where neither side is the live event - so the version above, which
     * captures `current` first, cannot answer it.
     */
    public List<FieldChange> diff(String previousSnapshotJson, String currentSnapshotJson) {
        if (previousSnapshotJson == null || previousSnapshotJson.isBlank()
                || currentSnapshotJson == null || currentSnapshotJson.isBlank()) {
            return List.of();
        }
        Map<String, Object> before;
        Map<String, Object> after;
        try {
            before = objectMapper.readValue(previousSnapshotJson, new TypeReference<>() {});
            after = objectMapper.readValue(currentSnapshotJson, new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }

        List<FieldChange> changes = new ArrayList<>();
        // Ordered fields first, then anything an older snapshot carried that
        // this version no longer captures - dropping those silently would hide
        // a real difference behind a schema change.
        Set<String> extras = new TreeSet<>(before.keySet());
        extras.removeAll(FIELD_ORDER);

        List<String> keys = new ArrayList<>(FIELD_ORDER);
        keys.addAll(extras);

        for (String key : keys) {
            Object b = before.get(key);
            Object a = after.get(key);
            if (!Objects.equals(b, a)) {
                changes.add(new FieldChange(key, str(b), str(a)));
            }
        }
        return changes;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    /** One line of the diff an admin reads. */
    public record FieldChange(String field, String before, String after) {}
}
