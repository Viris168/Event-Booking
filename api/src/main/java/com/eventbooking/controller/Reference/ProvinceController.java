package com.eventbooking.controller.Reference;

import com.eventbooking.model.ProvinceRef;
import com.eventbooking.repository.ProvinceRefRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The provinces a venue may sit in.
 *
 * <p>Exists so a client stops hardcoding them. The web app carried its own
 * two-letter list ({@code PP}, {@code SR}, {@code BB}...) that matched nothing
 * in {@code province_ref}, and since {@code venue.province_code} is a foreign
 * key, every venue outside the two seeded provinces failed to save with an
 * error the client could not act on.
 *
 * <p>Read-only and unauthenticated on purpose: it is a public list of the
 * country's subdivisions, not anybody's data.
 */
@RestController
@RequestMapping("/api/v1/province")
@Tag(name = "Reference", description = "Lookup data shared by every client")
public class ProvinceController {

    private final ProvinceRefRepository provinceRepository;

    public ProvinceController(ProvinceRefRepository provinceRepository) {
        this.provinceRepository = provinceRepository;
    }

    @GetMapping
    @Operation(summary = "Every province a venue can be in, alphabetically")
    public List<ProvinceResponse> list() {
        return provinceRepository.findAllByOrderByNameEnAsc().stream()
                .map(p -> new ProvinceResponse(p.getCode(), p.getNameEn(), p.getNameKm()))
                .toList();
    }

    public record ProvinceResponse(String code, String nameEn, String nameKm) {
    }
}
